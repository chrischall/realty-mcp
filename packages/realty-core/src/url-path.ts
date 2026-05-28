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
 * Accepts an absolute URL (any host — only the path is kept), a path
 * already starting with `/` (returned unchanged), or a bare segment
 * which is coerced to a leading-slash path. Malformed input that
 * `new URL()` cannot parse falls through to the same path-coercion
 * branch, so the function never throws.
 *
 * @example urlToPath('https://www.zillow.com/homedetails/foo/7_zpid/')
 *   // '/homedetails/foo/7_zpid/'
 * @example urlToPath('homedetails/7_zpid/')   // '/homedetails/7_zpid/'
 * @example urlToPath('/already/a/path/')      // '/already/a/path/'
 */
export function urlToPath(input: string): string {
  try {
    const u = new URL(input);
    return `${u.pathname}${u.search}`;
  } catch {
    return input.startsWith('/') ? input : `/${input}`;
  }
}
