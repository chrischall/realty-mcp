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
  state: string;
  aliases: string[];
  resolved?: string;
}

interface AliasFile {
  entries: AliasEntry[];
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

function normKey(k: LocalityKey): string {
  return `${k.city.toLowerCase().trim()}|${k.state.toLowerCase().trim()}`;
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
   * Load aliases from a JSON file. Shape:
   *
   * ```json
   * { "entries": [
   *   { "city": "Lake Lure", "state": "NC", "aliases": ["Rutherfordton"], "resolved": "Rutherfordton" }
   * ] }
   * ```
   */
  static fromFile(path: string): LocalityAliasMap {
    // Lazy-require so the module stays bundleable in environments
    // without `node:fs` (e.g. browser-side consumers — unlikely for
    // realty MCPs, but cheap insurance).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    const raw = fs.readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as AliasFile;
    return new LocalityAliasMap(parsed.entries ?? []);
  }

  /**
   * Look up a `{city, state}`. Returns aliases (empty if unknown) and
   * a `resolved` parent locality when the alias chain converges.
   */
  lookup(key: LocalityKey): LocalityLookup {
    const hit = this.index.get(normKey(key));
    if (!hit) return { aliases: [], resolved: null };
    return { aliases: [...hit.aliases], resolved: hit.resolved };
  }
}
