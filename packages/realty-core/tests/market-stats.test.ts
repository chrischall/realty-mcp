import { describe, it, expect } from 'vitest';
import { computeMarketStats, median, mean, numericColumn } from '../src/market-stats.js';

describe('median / mean', () => {
  it('median of odd and even lengths, without mutating the input', () => {
    const xs = [5, 1, 3];
    expect(median(xs)).toBe(3);
    expect(xs).toEqual([5, 1, 3]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('mean', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
  it('empty input is null, never NaN', () => {
    expect(median([])).toBeNull();
    expect(mean([])).toBeNull();
  });
});

describe('numericColumn', () => {
  it('keeps finite numbers only — null, strings, NaN and ±Infinity are skipped', () => {
    const rows = [
      { v: 1 },
      { v: null },
      { v: '2' },
      { v: Number.NaN },
      { v: Number.POSITIVE_INFINITY },
      { v: 3 },
      {},
    ];
    expect(numericColumn(rows as Array<Record<string, unknown>>, 'v')).toEqual([1, 3]);
  });
});

// hemnet-mcp's SoldSummary naming
interface HemnetSold {
  final_price: number | null;
  price_per_sqm: number | null;
  price_change_percent: number | null;
}

// booli-mcp's PropertySummary naming
interface BooliSold {
  sold_price: number | null;
  price_per_sqm: number | null;
  sold_vs_asking_percent: number | null;
}

describe('computeMarketStats', () => {
  const hemnet: HemnetSold[] = [
    { final_price: 3_000_000, price_per_sqm: 50_000, price_change_percent: 5 },
    { final_price: 4_000_000, price_per_sqm: null, price_change_percent: -2.25 },
    { final_price: null, price_per_sqm: 61_001, price_change_percent: null },
    { final_price: 5_500_001, price_per_sqm: 55_000, price_change_percent: 1 },
  ];

  it("reproduces hemnet-mcp's output exactly (final_price naming)", () => {
    expect(
      computeMarketStats(hemnet, {
        price: 'final_price',
        pricePerSqm: 'price_per_sqm',
        priceChangePercent: 'price_change_percent',
        priceName: 'final_price',
      })
    ).toEqual({
      sample_size: 4,
      median_final_price: 4_000_000,
      average_final_price: 4_166_667,
      median_price_per_sqm: 55_000,
      average_price_per_sqm: 55_334,
      average_price_change_percent: 1.3,
      min_final_price: 3_000_000,
      max_final_price: 5_500_001,
    });
  });

  it("reproduces booli-mcp's output exactly (sold_price naming), key order included", () => {
    const booli: BooliSold[] = hemnet.map((h) => ({
      sold_price: h.final_price,
      price_per_sqm: h.price_per_sqm,
      sold_vs_asking_percent: h.price_change_percent,
    }));
    const stats = computeMarketStats(booli, {
      price: 'sold_price',
      pricePerSqm: 'price_per_sqm',
      priceChangePercent: 'sold_vs_asking_percent',
      priceName: 'sold_price',
    });
    expect(Object.keys(stats)).toEqual([
      'sample_size',
      'median_sold_price',
      'average_sold_price',
      'median_price_per_sqm',
      'average_price_per_sqm',
      'average_price_change_percent',
      'min_sold_price',
      'max_sold_price',
    ]);
    expect(stats.median_sold_price).toBe(4_000_000);
    expect(stats.max_sold_price).toBe(5_500_001);
  });

  it('all-null columns and an empty sample give nulls, not NaN / ±Infinity', () => {
    const fields = {
      price: 'final_price',
      pricePerSqm: 'price_per_sqm',
      priceChangePercent: 'price_change_percent',
      priceName: 'final_price',
    } as const;
    expect(computeMarketStats([] as HemnetSold[], fields)).toEqual({
      sample_size: 0,
      median_final_price: null,
      average_final_price: null,
      median_price_per_sqm: null,
      average_price_per_sqm: null,
      average_price_change_percent: null,
      min_final_price: null,
      max_final_price: null,
    });
  });

  it('a NaN price no longer poisons every statistic (stricter than both copies)', () => {
    const rows = [
      { final_price: Number.NaN, price_per_sqm: null, price_change_percent: null },
      { final_price: 2_000_000, price_per_sqm: null, price_change_percent: null },
    ];
    const s = computeMarketStats(rows, {
      price: 'final_price',
      pricePerSqm: 'price_per_sqm',
      priceChangePercent: 'price_change_percent',
      priceName: 'final_price',
    });
    expect(s.median_final_price).toBe(2_000_000);
    expect(s.average_final_price).toBe(2_000_000);
    expect(s.min_final_price).toBe(2_000_000);
    expect(s.sample_size).toBe(2);
  });

  it('min / max do not overflow the call stack on a large sample', () => {
    const rows = Array.from({ length: 200_000 }, (_, i) => ({
      p: i + 1,
      q: null,
      c: null,
    }));
    const s = computeMarketStats(rows, {
      price: 'p',
      pricePerSqm: 'q',
      priceChangePercent: 'c',
      priceName: 'price',
    });
    expect(s.min_price).toBe(1);
    expect(s.max_price).toBe(200_000);
  });
});
