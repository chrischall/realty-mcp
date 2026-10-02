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

  // fleet-audit#666: a protocol-relative result escapes the portal host
  // once a consumer resolves it against the origin.
  it('collapses leading slashes / backslashes to a single "/"', () => {
    expect(urlToPath('//evil.com/x')).toBe('/evil.com/x');
    expect(urlToPath('\\\\evil.com/x')).toBe('/evil.com/x');
    expect(urlToPath('/\\evil.com/x')).toBe('/evil.com/x');
    expect(urlToPath('https://www.zillow.com//evil.com/x')).toBe('/evil.com/x');
    expect(urlToPath('https://www.zillow.com/\\evil.com/x')).toBe('/evil.com/x');
  });

  it('strips the tab / newline characters URL parsers silently drop', () => {
    expect(urlToPath('/\t/evil.com/x')).toBe('/evil.com/x');
    expect(urlToPath('/\n/evil.com/x')).toBe('/evil.com/x');
    expect(urlToPath('/a\tb')).toBe('/ab');
  });

  // fleet-audit#675: a non-http(s) scheme yields a pathname with no
  // leading slash ('x:@evil.com/home/1' → '@evil.com/home/1'), which a
  // `https://${host}${path}` join turns into a userinfo@evil.com URL.
  it('refuses non-http(s) absolute URLs', () => {
    for (const bad of [
      'x:@evil.com/home/1',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,hi',
      'ftp://www.zillow.com/a',
    ]) {
      expect(() => urlToPath(bad), bad).toThrow(/scheme/);
    }
  });

  it('never lets a path change the host it is joined to', () => {
    const payloads = [
      '//evil.com/x',
      '///evil.com/x',
      '\\\\evil.com/x',
      '/\\evil.com/x',
      '\\/evil.com/x',
      '/\t/evil.com/x',
      '/\r\n/evil.com/x',
      ' //evil.com/x',
      'https://www.zillow.com//evil.com/x',
      'https://www.zillow.com/\\/evil.com/x',
      'https://www.zillow.com/%2F%2Fevil.com',
      'http://evil.com//evil.com/@evil.com',
      '@evil.com/home/1',
      ':@evil.com/x',
      'evil.com',
    ];
    for (const p of payloads) {
      const path = urlToPath(p);
      expect(path, p).toMatch(/^\/(?![/\\])/);
      expect(new URL(path, 'https://www.zillow.com').host, p).toBe('www.zillow.com');
      expect(new URL(`https://www.zillow.com${path}`).host, p).toBe('www.zillow.com');
    }
  });
});

