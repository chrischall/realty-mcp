import { describe, it, expect } from 'vitest';
import { pivotSummary } from '../src/compare-summary.js';

interface P {
  price?: number | null;
  city?: string;
  hoa_fee?: { amount: number; period: string } | null;
  is_new?: boolean;
  living_area?: number;
}

describe('pivotSummary', () => {
  const rows: Array<{ property?: P; error?: string }> = [
    {
      property: {
        price: 500_000,
        city: 'Lake Lure',
        hoa_fee: { amount: 100, period: 'monthly' },
        is_new: false,
        living_area: 1800,
      },
    },
    { error: 'bridge timeout' },
    { property: { price: null, city: 'Bat Cave' } },
  ];

  it('one row per field, values aligned with the input rows', () => {
    expect(pivotSummary(rows, ['price', 'city'])).toEqual([
      { field: 'price', values: [500_000, null, null] },
      { field: 'city', values: ['Lake Lure', null, 'Bat Cave'] },
    ]);
  });

  it('keeps values verbatim — objects stay objects, booleans stay booleans (no JSON-encoding, #18/#37)', () => {
    const [hoa, isNew] = pivotSummary(rows, ['hoa_fee', 'is_new']);
    expect(hoa!.values[0]).toEqual({ amount: 100, period: 'monthly' });
    expect(hoa!.values[0]).toBe(rows[0]!.property!.hoa_fee);
    // onehome's copy mapped booleans to null; verbatim is the stated intent.
    expect(isNew!.values).toEqual([false, null, null]);
  });

  it('missing / undefined → null; a missing property (error row) → null', () => {
    expect(pivotSummary(rows, ['living_area'])[0]!.values).toEqual([1800, null, null]);
  });

  it('accepts relabelled accessor fields (zillow living_area → living_area_sqft)', () => {
    expect(
      pivotSummary(rows, [{ field: 'living_area_sqft', pick: (p) => p.living_area }])
    ).toEqual([{ field: 'living_area_sqft', values: [1800, null, null] }]);
  });

  it('empty rows → empty value arrays', () => {
    expect(pivotSummary([], ['price'])).toEqual([{ field: 'price', values: [] }]);
  });
});
