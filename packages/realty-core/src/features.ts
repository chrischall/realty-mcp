/**
 * Server-side keyword extraction from listing descriptions — the
 * canonical helper reconciling five cohort implementations.
 *
 * Each cohort MCP ships a byte-for-byte `src/features.ts` (round-4
 * candidate J): the same `ExtractedFeatures` shape, the same
 * pre-compiled regexes, the same detector ordering. Real-world callers
 * (zillow-mcp #14: a 53-listing session, ~100 KB of marketing copy)
 * immediately keyword-parse the prose for the same handful of features
 * — lake/waterfront, hot tub, basement state, furnished, dock,
 * community — and discard the rest. This module lifts that work so
 * each consumer can drop the raw description by default.
 *
 * Surveyed implementations (`src/features.ts` in each):
 *
 *  - onehome-mcp — CANONICAL. Its basement detector uses a
 *    `BASEMENT_CONNECTOR` conjunct class `(?:is|was|are|were|—|–|,|;|:|()`
 *    rather than the looser `[^.!?]{0,30}?` window the others use.
 *    The tight class rejects free-floating prepositions like "with",
 *    so "basement with finished oak shelving" no longer false-positives
 *    to `finished` (the shelving is finished, not the basement).
 *  - zillow-mcp / redfin-mcp / compass-mcp / homes-mcp — identical
 *    extraction logic; only the looser basement window and the
 *    `loadCommunities` caching variants differ.
 *
 * Pure / dependency-free by design. `extractFeatures` takes a
 * description string AND a community-name vocabulary (a `string[]`,
 * possibly empty) — the consumer resolves that vocabulary separately.
 * The cohort's `loadCommunities` does filesystem I/O (reads a JSON
 * file named by an env var) and therefore stays per-consumer: pulling
 * it here would add a `node:fs` dependency and break realty-core's
 * no-I/O invariant. This module only consumes the resolved list.
 *
 * The detector to remember: `unfinished basement` is checked BEFORE
 * `finished basement` because `finished` substring-matches inside
 * `unfinished`. That ordering is the regression-pinned subtle-bug guard.
 */

/** Structured features extracted from a listing description. */
export interface ExtractedFeatures {
  /** True when the prose mentions lakefront / lake front / waterfront. */
  lake_front: boolean;
  /** True when the prose mentions a hot tub. */
  hot_tub: boolean;
  /**
   * Basement state. `'unknown'` means a basement is mentioned without a
   * recognized finish state; `null` means no basement mention at all.
   */
  basement: 'finished' | 'unfinished' | 'partial' | 'unknown' | null;
  /** Furnishing level, or `null` when not mentioned. */
  furnished: 'fully' | 'partial' | 'negotiable' | null;
  /** Dock / water-access type, or `null` when not mentioned. */
  dock: 'private' | 'community' | 'marina' | 'boat_slip' | null;
  /** First-by-position matched community name, or `null`. */
  community: string | null;
}

// Pre-compiled regex constants. `i` for case-insensitivity throughout.
const LAKE_FRONT_RE = /\b(?:lakefront|lake front|waterfront)\b/i;
const HOT_TUB_RE = /\bhot tub\b/i;

// Accepts both word orders. Canonical adjective form ("unfinished basement")
// AND verb-attached / parenthetical / punctuated state ("basement is
// unfinished", "basement: unfinished", "basement, unfinished"). The
// connector class deliberately rejects free-floating prepositions like
// "with" / "near" — those would catch "basement with finished oak
// shelving" → 'finished', which is about the shelving, not the basement.
const BASEMENT_CONNECTOR = '(?:is|was|are|were|—|–|,|;|:|\\()';
const BASEMENT_UNFINISHED_RE = new RegExp(
  `\\b(?:unfinished basement|basement\\s*${BASEMENT_CONNECTOR}\\s*(?:\\w+\\s+){0,2}unfinished)\\b`,
  'i'
);
const BASEMENT_FINISHED_RE = new RegExp(
  `\\b(?:finished basement|basement\\s*${BASEMENT_CONNECTOR}\\s*(?:\\w+\\s+){0,2}finished)\\b`,
  'i'
);
const BASEMENT_PARTIAL_RE = new RegExp(
  `\\b(?:partial(?:ly)? (?:finished )?basement|partial basement|basement\\s*${BASEMENT_CONNECTOR}\\s*(?:\\w+\\s+){0,2}partial(?:ly)?)\\b`,
  'i'
);
const BASEMENT_MENTIONED_RE = /\bbasement\b/i;

const FURNISHED_FULLY_RE = /\b(?:fully furnished|sold furnished|turnkey)\b/i;
// `with exceptions` is intentionally NOT a standalone alternative — real
// estate descriptions routinely contain "with exceptions" in title /
// survey / HOA / disclosure contexts unrelated to furnishings. Require
// the `furnished` token to anchor the match.
const FURNISHED_PARTIAL_RE = /\b(?:almost furnished|furnished with exceptions)\b/i;
const FURNISHED_NEGOTIABLE_RE = /\bfurnishings (?:are )?negotiable\b/i;

const DOCK_PRIVATE_RE = /\bprivate (?:boat )?dock\b/i;
const DOCK_COMMUNITY_RE = /\b(?:community|shared) dock\b/i;
// Negative-lookahead place-name guard (ported from redfin-mcp — strictly
// more precise than the cohort's naked `/\bmarina\b/i`). "marina" is a
// common place / street name; the lookahead rejects the usual address
// suffixes ("Marina Bay", "Marina del Rey", "123 Marina Dr") so addresses
// don't false-positive to the 'marina' dock feature, while genuine
// water-access prose ("deep-water marina with boat access") still matches.
const DOCK_MARINA_RE =
  /\bmarina\b(?!\s+(?:del|bay|dr|drive|blvd|boulevard|st|street|ave|avenue))/i;
const DOCK_BOAT_SLIP_RE = /\bboat ?slip\b/i;

/**
 * Extract structured features from a listing description.
 *
 * Pure / deterministic — no I/O, no dependencies. Hoisted from the
 * realty cohort (zillow/redfin/compass/homes/onehome), with onehome's
 * tighter basement detector as the canonical form.
 *
 * @param description Listing prose; `undefined` is treated as empty.
 * @param communities Resolved community vocabulary (may be empty). The
 *   earliest match by document position wins — see the community
 *   detector. The consumer resolves this list (e.g. its own
 *   `loadCommunities`); this function never reads files or env.
 *
 * @example extractFeatures('Lakefront with a private dock.', []).dock // 'private'
 * @example extractFeatures('Basement with finished oak shelving.', []).basement // 'unknown'
 */
export function extractFeatures(
  description: string | undefined,
  communities: string[]
): ExtractedFeatures {
  const text = description ?? '';
  return {
    lake_front: LAKE_FRONT_RE.test(text),
    hot_tub: HOT_TUB_RE.test(text),
    basement: detectBasement(text),
    furnished: detectFurnished(text),
    dock: detectDock(text),
    community: detectCommunity(text, communities),
  };
}

function detectBasement(text: string): ExtractedFeatures['basement'] {
  // ORDER MATTERS. `finished basement` substring-matches inside
  // `unfinished basement`; check the longer phrase first.
  if (BASEMENT_UNFINISHED_RE.test(text)) return 'unfinished';
  if (BASEMENT_PARTIAL_RE.test(text)) return 'partial';
  if (BASEMENT_FINISHED_RE.test(text)) return 'finished';
  if (BASEMENT_MENTIONED_RE.test(text)) return 'unknown';
  return null;
}

function detectFurnished(text: string): ExtractedFeatures['furnished'] {
  if (FURNISHED_FULLY_RE.test(text)) return 'fully';
  if (FURNISHED_NEGOTIABLE_RE.test(text)) return 'negotiable';
  if (FURNISHED_PARTIAL_RE.test(text)) return 'partial';
  return null;
}

function detectDock(text: string): ExtractedFeatures['dock'] {
  // Specificity order: private > community > boat_slip > marina.
  // (Marina is the most general and shows up in lots of incidental
  // contexts; check it last.)
  if (DOCK_PRIVATE_RE.test(text)) return 'private';
  if (DOCK_COMMUNITY_RE.test(text)) return 'community';
  if (DOCK_BOAT_SLIP_RE.test(text)) return 'boat_slip';
  if (DOCK_MARINA_RE.test(text)) return 'marina';
  return null;
}

function detectCommunity(text: string, communities: string[]): string | null {
  if (communities.length === 0 || text.length === 0) return null;
  // Find the EARLIEST match in document order — first-by-position, not
  // first-by-vocabulary-position. A listing that mentions both "Riverbend
  // at Lake Lure" and "Rumbling Bald" should resolve to whichever is
  // mentioned first in the prose.
  let earliest: { name: string; index: number } | null = null;
  for (const name of communities) {
    // Word-boundary anchors handle case + trailing punctuation naturally.
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    const m = re.exec(text);
    if (m && (earliest === null || m.index < earliest.index)) {
      earliest = { name, index: m.index };
    }
  }
  return earliest?.name ?? null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
