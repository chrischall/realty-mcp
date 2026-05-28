import { describe, it, expect } from 'vitest';
import { urlToPath } from '../src/url-path.js';

describe('urlToPath', () => {
  it('reduces an absolute URL to its path portion', () => {
    expect(urlToPath('https://www.zillow.com/homedetails/foo/7_zpid/')).toBe(
      '/homedetails/foo/7_zpid/'
    );
  });

  it('preserves the query string', () => {
    expect(urlToPath('https://www.redfin.com/home/123?foo=bar')).toBe(
      '/home/123?foo=bar'
    );
  });

  it('keeps the path even when the host differs', () => {
    expect(urlToPath('http://example.org/a/b/c')).toBe('/a/b/c');
  });

  it('returns a leading-slash path unchanged', () => {
    expect(urlToPath('/already/a/path/')).toBe('/already/a/path/');
  });

  it('preserves the query on an already-a-path input', () => {
    expect(urlToPath('/homes/?searchQueryState=%7B%7D')).toBe(
      '/homes/?searchQueryState=%7B%7D'
    );
  });

  it('coerces a bare segment to a leading-slash path', () => {
    expect(urlToPath('homedetails/7_zpid/')).toBe('/homedetails/7_zpid/');
  });

  it('handles an empty string gracefully (→ "/")', () => {
    expect(urlToPath('')).toBe('/');
  });

  it('does not throw on a malformed URL — falls back to path coercion', () => {
    // Not a parseable URL; lacks a leading slash → gets one prepended.
    expect(urlToPath('not a url')).toBe('/not a url');
  });
});
