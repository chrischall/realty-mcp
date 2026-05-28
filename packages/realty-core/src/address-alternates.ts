/**
 * Cross-MLS address-alternate collection — the canonical pair
 * reconciling four cohort copies.
 *
 * Portals frequently carry MORE than one string for the same parcel:
 * the display `streetAddress` plus an `mlsStreetAddress`, an
 * `UnparsedAddress`, or arbitrary `altAddresses[]` from the feed.
 * When those disagree they're worth surfacing (the
 * `address_alternates` field on the shared property shape) — but only
 * the ones that *meaningfully* differ from the primary, deduped, with
 * input order preserved.
 *
 * Surveyed implementations (byte-identical internals):
 *
 *  - redfin-mcp `src/derived.ts` `normalizeAddressForCompare` /
 *    `collectAddressAlternates`
 *  - zillow-mcp `src/tools/properties.ts` — byte-for-byte the same,
 *    differing only in how it gathers candidates (`mlsStreetAddress` +
 *    `altAddresses[]`) before the dedup.
 *  - onehome-mcp `src/format.ts` — same internals, candidate source is
 *    `customProperty.UnparsedAddress`.
 *  - compass-mcp `src/tools/by-address.ts` `normalizeAddressForMatch`
 *    is the same normalisation under another name.
 *
 * The cohort copies differ ONLY in how they collect their candidate
 * list (each portal pulls from different raw fields). This canonical
 * form takes the candidate list as an argument so every portal becomes
 * a thin gather-then-call wrapper.
 *
 * NOTE: this is DISTINCT from `tokenize` / `addressMatch` in
 * `address-match.ts`. Those are fuzzy token-overlap scorers for
 * resolve/search. These are a strict normalize-then-dedup pair for
 * alternate collection — different job, different semantics. Pure /
 * dependency-free.
 */

/**
 * Normalize an address string for equality checks: lowercase, drop the
 * `,`/`#`/`.` punctuation, collapse runs of whitespace to a single
 * space, and trim.
 *
 * This is the cohort's exact normalisation
 * (`.toLowerCase().replace(/[,#.]/g, '').replace(/\s+/g, ' ').trim()`)
 * — used purely for the equality/dedup compare below, never surfaced
 * to callers as a display value.
 *
 * @example normalizeAddressForCompare('123 Main St., #4')  // '123 main st 4'
 * @example normalizeAddressForCompare('  A  B ')            // 'a b'
 * @example normalizeAddressForCompare(undefined)            // ''
 */
export function normalizeAddressForCompare(
  s: string | undefined | null
): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[,#.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Collect alternate address strings, excluding any that normalize-match
 * the `primary` and deduping candidates that normalize-collide with one
 * another. Input order is preserved, and the ORIGINAL (un-normalized)
 * candidate text is returned — the normalisation is only used for the
 * compare.
 *
 * A candidate is skipped when it normalizes to the empty string
 * (missing / whitespace / punctuation-only), equals the normalized
 * primary, or has already been seen (by normalized form). When the
 * primary is missing every distinct candidate surfaces.
 *
 * @example
 * collectAddressAlternates('123 Main St', ['123 Main St., ', '123 Main Street'])
 * // ['123 Main Street']  — the punctuation-only variant is dropped as a primary dupe
 */
export function collectAddressAlternates(
  primary: string | undefined | null,
  candidates: Array<string | undefined | null>
): string[] {
  const primaryNorm = normalizeAddressForCompare(primary);
  const seen = new Set<string>();
  const alternates: string[] = [];
  for (const candidate of candidates) {
    const norm = normalizeAddressForCompare(candidate);
    if (!norm) continue;
    if (norm === primaryNorm) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    // `candidate` is non-null here: a null/undefined would normalize to
    // '' and have been skipped above.
    alternates.push(candidate as string);
  }
  return alternates;
}
