/**
 * URL → path reduction (cohort candidate F).
 *
 * Every fetchproxy-backed cohort MCP serves its pages from a single
 * fixed origin (`https://www.zillow.com`, `https://www.redfin.com`, …)
 * and the FetchproxyTransport prepends that origin for us — tools work
 * in terms of paths, not full URLs. When a tool accepts a `url` arg from
 * the user it has to reduce it to a path+search before handing it off.
 *
 * This ~4-line body was byte-identical in `src/url.ts` across four of the
 * five cohort MCPs (zillow / redfin / compass / homes; onehome uses a
 * different id scheme and is intentionally excluded). Hoisting the
 * canonical version collapses those copies into one.
 *
 * Pure / dependency-free.
 */

/**
 * Reduce a portal URL (or path) to its `pathname + search` portion.
 *
 * Accepts an absolute http(s) URL (any host — only the path is kept), a
 * path already starting with `/`, or a bare segment which is coerced to
 * a leading-slash path. Malformed input that `new URL()` cannot parse
 * falls through to the same path-coercion branch.
 *
 * Safe by construction: the result always starts with exactly ONE `/`
 * (never `//` or `/\`), so neither `new URL(path, origin)` nor a
 * `https://${host}${path}` join can be steered to another host
 * (fleet-audit#666). Tab / CR / LF — which URL parsers silently delete,
 * turning `/\t/evil.com` into `//evil.com` — are stripped first.
 *
 * @throws if `input` is an absolute URL with a non-http(s) scheme
 *   (`javascript:`, `file:`, `x:@evil.com/…`): its pathname has no leading
 *   slash and would join as `https://host@evil.com/…` (fleet-audit#675).
 *
 * @example urlToPath('https://www.zillow.com/homedetails/foo/7_zpid/')
 *   // '/homedetails/foo/7_zpid/'
 * @example urlToPath('homedetails/7_zpid/')   // '/homedetails/7_zpid/'
 * @example urlToPath('/already/a/path/')      // '/already/a/path/'
 * @example urlToPath('//evil.com/x')          // '/evil.com/x'
 */
export function urlToPath(input: string): string {
  // Mirror the WHATWG URL parser's pre-processing: drop every tab / CR /
  // LF and trim leading / trailing C0 controls and spaces.
  // eslint-disable-next-line no-control-regex
  const cleaned = input.replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
  let path: string;
  let url: URL | null = null;
  try {
    url = new URL(cleaned);
  } catch {
    // Not an absolute URL — treat as a path / bare segment below.
  }
  if (url) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(
        `urlToPath: unsupported URL scheme "${url.protocol}" — expected an http(s) URL or a path`
      );
    }
    path = `${url.pathname}${url.search}`;
  } else {
    path = cleaned;
  }
  // Collapse any run of leading slashes / backslashes to a single '/'.
  return `/${path.replace(/^[/\\]+/, '')}`;
}
