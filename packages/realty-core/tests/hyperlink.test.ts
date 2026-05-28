import { describe, it, expect } from 'vitest';
import { buildHyperlinkFormula } from '../src/hyperlink.js';

describe('buildHyperlinkFormula', () => {
  it('builds a basic =HYPERLINK formula', () => {
    expect(
      buildHyperlinkFormula('https://www.zillow.com/homedetails/123', 'Zillow')
    ).toBe('=HYPERLINK("https://www.zillow.com/homedetails/123","Zillow")');
  });

  it('doubles an embedded double-quote in the url (the latent bug fix)', () => {
    // zillow/compass/onehome shipped without this escaping today: an
    // embedded `"` in the url terminated the Sheets string literal and
    // produced a #ERROR! formula. The canonical helper doubles it.
    expect(buildHyperlinkFormula('https://x.com/a"b', 'Zillow')).toBe(
      '=HYPERLINK("https://x.com/a""b","Zillow")'
    );
  });

  it('doubles an embedded double-quote in the label too', () => {
    expect(buildHyperlinkFormula('https://x.com/a', 'A "Nice" Home')).toBe(
      '=HYPERLINK("https://x.com/a","A ""Nice"" Home")'
    );
  });

  it('doubles quotes in both url and label at once', () => {
    expect(buildHyperlinkFormula('https://x.com/"q"', 'L"L')).toBe(
      '=HYPERLINK("https://x.com/""q""","L""L")'
    );
  });

  it('returns empty string for an empty url', () => {
    expect(buildHyperlinkFormula('', 'Zillow')).toBe('');
  });

  it('returns empty string for a null/undefined url', () => {
    expect(buildHyperlinkFormula(null as unknown as string, 'Zillow')).toBe('');
    expect(
      buildHyperlinkFormula(undefined as unknown as string, 'Zillow')
    ).toBe('');
  });

  it('leaves a quote-free url and label untouched', () => {
    expect(
      buildHyperlinkFormula('https://www.redfin.com/home/9', 'Redfin')
    ).toBe('=HYPERLINK("https://www.redfin.com/home/9","Redfin")');
  });
});
