/**
 * Google-Sheets `=HYPERLINK(...)` formula builder for the
 * `portal_url_hyperlink` field.
 *
 * Every cohort MCP's `FormattedProperty` carries a
 * `portal_url_hyperlink` — a `=HYPERLINK("<url>","<PortalLabel>")`
 * string that renders as a clickable link when pasted into a Sheets
 * cell. Each MCP builds it the same way:
 *
 *  - redfin-mcp `src/derived.ts` `buildPortalUrlHyperlink()`
 *  - homes-mcp `src/format.ts` `buildPortalUrlHyperlink()`
 *  - zillow-mcp / compass-mcp / onehome-mcp — inline in their
 *    property formatters
 *
 * This is the canonical home so the cohort migration (realty-mcp#1)
 * collapses those five copies into one. Pure / dependency-free.
 *
 * LATENT BUG FIXED HERE: redfin + homes correctly double up an
 * embedded `"` (Sheets escapes a quote inside a string literal by
 * doubling it: `"` → `""`). zillow, compass, and onehome did NOT —
 * an embedded `"` in the url terminated the formula's string literal
 * early and produced a `#ERROR!` cell. The canonical helper escapes
 * BOTH the url and the label, fixing the bug cohort-wide.
 */

/**
 * Escape a string for embedding inside a Sheets formula string
 * literal — double every `"` (`"` → `""`).
 */
function escapeForFormula(s: string): string {
  return s.replace(/"/g, '""');
}

/**
 * Build a Google-Sheets `=HYPERLINK("<url>","<label>")` formula.
 *
 * Both `url` and `label` have their embedded double-quotes doubled
 * (`"` → `""`) so the formula parses correctly when pasted into a
 * cell. A missing / empty `url` yields an empty string (no point
 * emitting a hyperlink to nowhere).
 *
 * @example buildHyperlinkFormula('https://x.com/9', 'Zillow')
 *   // '=HYPERLINK("https://x.com/9","Zillow")'
 * @example buildHyperlinkFormula('https://x.com/a"b', 'Zillow')
 *   // '=HYPERLINK("https://x.com/a""b","Zillow")'
 * @example buildHyperlinkFormula('', 'Zillow') // ''
 */
export function buildHyperlinkFormula(url: string, label: string): string {
  if (!url) return '';
  const safeUrl = escapeForFormula(url);
  const safeLabel = escapeForFormula(label ?? '');
  return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
}
