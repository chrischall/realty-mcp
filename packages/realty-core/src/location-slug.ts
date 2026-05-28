/**
 * Free-text location → URL slug (cohort candidate G).
 *
 * The cohort portals whose search routes take a slug segment
 * (`/homes-for-sale/<slug>/`) all slugify a free-text location the same
 * way: NFKD-normalize, strip diacritics, lowercase, collapse runs of
 * non-alphanumerics to a single `-`, then trim leading/trailing `-`.
 *
 * This was byte-identical in `compass-mcp/src/url.ts` and
 * `homes-mcp/src/url.ts`; the canonical version hoists it verbatim.
 *
 * Pure / dependency-free.
 */

/**
 * Slugify a free-text location into a portal search-URL segment.
 *
 * Diacritics are stripped, spaces / commas / punctuation collapse to a
 * single `-`, and leading/trailing separators are trimmed. A bare ZIP
 * passes through unchanged.
 *
 * @example locationToSlug('Brooklyn, NY')  // 'brooklyn-ny'
 * @example locationToSlug('New York, NY')  // 'new-york-ny'
 * @example locationToSlug('Lake Lure, NC') // 'lake-lure-nc'
 * @example locationToSlug('94110')         // '94110'
 * @example locationToSlug('Park Slope')    // 'park-slope'
 */
export function locationToSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
