import { describe, it, expect } from 'vitest';
import { cleanTaxAnnual } from '../src/tax.js';

describe('cleanTaxAnnual', () => {
  it('treats 0 as a not-yet-assessed sentinel', () => {
    expect(cleanTaxAnnual(0)).toEqual({
      tax_annual: null,
      tax_status: 'not_yet_assessed',
    });
  });

  it('treats 1 as a not-yet-assessed sentinel', () => {
    expect(cleanTaxAnnual(1)).toEqual({
      tax_annual: null,
      tax_status: 'not_yet_assessed',
    });
  });

  it('treats a sub-$10 value (homes calibration) as a sentinel', () => {
    // 5 falls in the gap between the old <=1 cohort threshold and
    // homes-mcp's production-calibrated <10 threshold. The canonical
    // helper adopts homes's wider guard, so 5 is a sentinel here even
    // though zillow/compass/onehome's old <=1 guard would have kept it.
    expect(cleanTaxAnnual(5)).toEqual({
      tax_annual: null,
      tax_status: 'not_yet_assessed',
    });
  });

  it('treats 9 (just under the threshold) as a sentinel', () => {
    expect(cleanTaxAnnual(9)).toEqual({
      tax_annual: null,
      tax_status: 'not_yet_assessed',
    });
  });

  it('keeps a value exactly at the $10 threshold as real', () => {
    expect(cleanTaxAnnual(10)).toEqual({
      tax_annual: 10,
      tax_status: null,
    });
  });

  it('keeps a real assessed amount as-is', () => {
    expect(cleanTaxAnnual(8421)).toEqual({
      tax_annual: 8421,
      tax_status: null,
    });
  });

  it('treats null as absent, not a sentinel', () => {
    expect(cleanTaxAnnual(null)).toEqual({
      tax_annual: null,
      tax_status: null,
    });
  });

  it('treats undefined as absent, not a sentinel', () => {
    expect(cleanTaxAnnual(undefined)).toEqual({
      tax_annual: null,
      tax_status: null,
    });
  });

  it('treats NaN / non-finite input as absent, not a sentinel', () => {
    expect(cleanTaxAnnual(NaN)).toEqual({
      tax_annual: null,
      tax_status: null,
    });
    expect(cleanTaxAnnual(Infinity)).toEqual({
      tax_annual: null,
      tax_status: null,
    });
  });
});
