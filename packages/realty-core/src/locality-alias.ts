/**
 * Locality alias remap — when a property is listed under a "parent"
 * municipality that the agent's free-text doesn't mention.
 *
 * Round-3 #75 cohort:
 *  - Lake Lure (NC) listings are often MLS-cataloged under
 *    Rutherfordton.
 *  - Beech Mountain and Sugar Mountain (NC) properties surface under
 *    Banner Elk.
 *
 * Hoisted from zillow-mcp's planned `resolver.ts loadLocalityAliases`
 * (not yet shipped there). Each cohort MCP will adopt this map once
 * 0.1.x publishes — the migration tracker issue lists each adopter.
 */

// No `node:fs` import here — realty-core stays free of I/O at module load
// (fleet-audit#664). A static `import … from 'node:fs'` dragged the builtin
// into every consumer bundle, forcing `nodejs_compat` on Workers-hosted
// connectors even when they never read a file. `fromJSON` is the I/O-free
// entry point; the legacy `fromFile` resolves `fs` lazily, at call time.

export interface LocalityKey {
  city: string;
  state: string;
}

export interface LocalityLookup {
  /** Alternate city names the cohort should retry under. */
  aliases: string[];
  /** Preferred resolution if the alias chain converges. */
  resolved: string | null;
}

interface AliasEntry {
  city: string;
  /** `null` for a state-less legacy pair: it matches the city in any state. */
  state: string | null;
  aliases: string[];
  resolved?: string;
}

/**
 * zillow-mcp's documented `ZILLOW_LOCALITY_ALIASES_FILE` format: a top-level
 * array of state-less `[a, b]` pairs, each registered BOTH ways
 * (`[["Lake Lure", "Rutherfordton"]]` aliases each to the other). A pair does
 * not say which side is the parent, so no `resolved` is set. Partners of a
 * shared city collect in file order, de-duplicated (zillow's `buildAliasMap`).
 */
function parseLegacyPairs(doc: unknown[]): AliasEntry[] {
  const byCity = new Map<string, AliasEntry>();
  const add = (city: string, alias: string): void => {
    const key = city.toLowerCase().trim();
    let entry = byCity.get(key);
    if (!entry) {
      entry = { city, state: null, aliases: [] };
      byCity.set(key, entry);
    }
    if (!entry.aliases.includes(alias)) entry.aliases.push(alias);
  };
  doc.forEach((pair: unknown, i) => {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((s) => typeof s === 'string')) {
      throw new TypeError(`LocalityAliasMap: [${i}] must be a [string, string] pair`);
    }
    const [a, b] = pair as [string, string];
    add(a, b);
    add(b, a);
  });
  return [...byCity.values()];
}

/**
 * Validate the `{ entries: [...] }` alias document shape. Throws a
 * `TypeError` naming the offending field — an entry missing `city` used to
 * surface as an opaque "cannot read properties of undefined" inside the
 * key normaliser.
 */
function parseAliasDocument(doc: unknown): AliasEntry[] {
  if (Array.isArray(doc)) return parseLegacyPairs(doc);
  if (typeof doc !== 'object' || doc === null) {
    throw new TypeError(
      'LocalityAliasMap: expected an object of shape { entries: [...] } ' +
        'or an array of [a, b] pairs'
    );
  }
  const entries = (doc as { entries?: unknown }).entries;
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    throw new TypeError('LocalityAliasMap: "entries" must be an array');
  }
  return entries.map((e: unknown, i): AliasEntry => {
    const at = `LocalityAliasMap: entries[${i}]`;
    if (typeof e !== 'object' || e === null) {
      throw new TypeError(`${at} must be an object`);
    }
    const { city, state, aliases, resolved } = e as Record<string, unknown>;
    if (typeof city !== 'string') {
      throw new TypeError(`${at}.city must be a string`);
    }
    if (typeof state !== 'string') {
      throw new TypeError(`${at}.state must be a string`);
    }
    if (!Array.isArray(aliases) || !aliases.every((a) => typeof a === 'string')) {
      throw new TypeError(`${at}.aliases must be an array of strings`);
    }
    if (resolved !== undefined && typeof resolved !== 'string') {
      throw new TypeError(`${at}.resolved must be a string when present`);
    }
    return resolved === undefined
      ? { city, state, aliases }
      : { city, state, aliases, resolved };
  });
}

const DEFAULT_ENTRIES: AliasEntry[] = [
  {
    city: 'Lake Lure',
    state: 'NC',
    aliases: ['Rutherfordton'],
    resolved: 'Rutherfordton',
  },
  {
    city: 'Beech Mountain',
    state: 'NC',
    aliases: ['Banner Elk'],
    resolved: 'Banner Elk',
  },
  {
    city: 'Sugar Mountain',
    state: 'NC',
    aliases: ['Banner Elk'],
    resolved: 'Banner Elk',
  },
];

/** Index key; a state-less entry is filed under the state `*`. */
function normKey(k: { city: string; state: string | null }): string {
  const state = k.state === null ? '*' : k.state.toLowerCase().trim();
  return `${k.city.toLowerCase().trim()}|${state}`;
}

export class LocalityAliasMap {
  private readonly index: Map<string, LocalityLookup>;

  private constructor(entries: readonly AliasEntry[]) {
    this.index = new Map();
    for (const e of entries) {
      this.index.set(normKey(e), {
        aliases: [...e.aliases],
        resolved: e.resolved ?? null,
      });
    }
  }

  /** Default map covering the round-3 #75 cohort. */
  static withDefaults(): LocalityAliasMap {
    return new LocalityAliasMap(DEFAULT_ENTRIES);
  }

  /** Empty map — useful in tests / when a consumer wants to opt out. */
  static empty(): LocalityAliasMap {
    return new LocalityAliasMap([]);
  }

  /**
   * Build a map from an already-parsed alias document — no I/O, so it works
   * in any runtime (Node, Workers, browser). Shape:
   *
   * ```json
   * { "entries": [
   *   { "city": "Lake Lure", "state": "NC", "aliases": ["Rutherfordton"], "resolved": "Rutherfordton" }
   * ] }
   * ```
   *
   * A missing `entries` yields an empty map; a malformed document throws a
   * `TypeError` naming the bad field.
   *
   * Also accepts zillow-mcp's legacy `ZILLOW_LOCALITY_ALIASES_FILE` format —
   * a top-level array of state-less `[a, b]` pairs, registered both ways and
   * matched in any state (`resolved` is `null`):
   *
   * ```json
   * [["Lake Lure", "Rutherfordton"], ["Beech Mountain", "Banner Elk"]]
   * ```
   */
  static fromJSON(doc: unknown): LocalityAliasMap {
    return new LocalityAliasMap(parseAliasDocument(doc));
  }

  /**
   * Load aliases from a JSON file on disk (Node only). Same shape and
   * validation as {@link LocalityAliasMap.fromJSON}.
   *
   * `fs` is resolved at call time via `process.getBuiltinModule` (Node ≥
   * 20.16 / 22.3), so importing realty-core never loads it. Prefer reading
   * the file yourself and calling `fromJSON` — that keeps file I/O in the
   * consumer, where the hoisting policy says it belongs.
   */
  static fromFile(path: string): LocalityAliasMap {
    const fs = globalThis.process?.getBuiltinModule?.('node:fs');
    if (!fs) {
      throw new Error(
        'LocalityAliasMap.fromFile needs Node.js (process.getBuiltinModule); ' +
          'read the file yourself and use LocalityAliasMap.fromJSON instead'
      );
    }
    return LocalityAliasMap.fromJSON(JSON.parse(fs.readFileSync(path, 'utf8')));
  }

  /**
   * Look up a `{city, state}`. Returns aliases (empty if unknown) and
   * a `resolved` parent locality when the alias chain converges.
   */
  lookup(key: LocalityKey): LocalityLookup {
    // A state-specific entry first; then a state-less legacy pair for the city.
    const hit = this.index.get(normKey(key)) ?? this.index.get(normKey({ city: key.city, state: null }));
    if (!hit) return { aliases: [], resolved: null };
    return { aliases: [...hit.aliases], resolved: hit.resolved };
  }
}
