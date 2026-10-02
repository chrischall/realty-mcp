import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  calculateAffordability,
  calculateMortgage,
  estimateRentVsBuy,
  mortgageInputSchema,
  affordabilityInputSchema,
  MAX_HORIZON_YEARS,
  MAX_LOAN_TERM_YEARS,
} from '../src/index.js';

const RVB = {
  home_price: 400_000,
  down_payment: 80_000,
  interest_rate: 6.5,
  monthly_rent: 2_200,
};
const MORT = { home_price: 400_000, interest_rate: 6.5 };
const AFF = { monthly_income: 10_000, down_payment: 50_000, interest_rate: 6 };

describe('exported calculator bounds (fleet-audit#1021)', () => {
  it('caps the horizon at 100 years and the loan term at 50 years', () => {
    expect(MAX_HORIZON_YEARS).toBe(100);
    expect(MAX_LOAN_TERM_YEARS).toBe(50);
  });
});

describe('estimateRentVsBuy bounds (fleet-audit#1021)', () => {
  it('rejects a horizon above MAX_HORIZON_YEARS without doing the work', () => {
    const t0 = Date.now();
    expect(() => estimateRentVsBuy({ ...RVB, horizon_years: 1e8 })).toThrow(
      /horizon_years/
    );
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(() =>
      estimateRentVsBuy({ ...RVB, horizon_years: MAX_HORIZON_YEARS + 1 })
    ).toThrow(/horizon_years/);
  });

  it('accepts a horizon of exactly MAX_HORIZON_YEARS', () => {
    const r = estimateRentVsBuy({ ...RVB, horizon_years: MAX_HORIZON_YEARS });
    expect(r.years).toHaveLength(MAX_HORIZON_YEARS);
  });

  it('rejects non-integer and non-finite horizons', () => {
    for (const h of [2.5, Infinity, NaN]) {
      expect(() => estimateRentVsBuy({ ...RVB, horizon_years: h })).toThrow(
        /horizon_years/
      );
    }
  });

  it('rejects a loan term above MAX_LOAN_TERM_YEARS, non-integer or non-finite', () => {
    for (const t of [MAX_LOAN_TERM_YEARS + 1, 1e8, 15.5, Infinity, NaN]) {
      expect(() => estimateRentVsBuy({ ...RVB, loan_term_years: t })).toThrow(
        /loan_term_years/
      );
    }
    expect(
      estimateRentVsBuy({ ...RVB, loan_term_years: MAX_LOAN_TERM_YEARS }).inputs
        .loan_term_years
    ).toBe(MAX_LOAN_TERM_YEARS);
  });

  it('rejects a down payment larger than the home price', () => {
    expect(() =>
      estimateRentVsBuy({ ...RVB, down_payment: RVB.home_price + 1 })
    ).toThrow(/down_payment/);
    // All-cash (down === price) is still a valid scenario.
    expect(
      estimateRentVsBuy({ ...RVB, down_payment: RVB.home_price }).years[0]
        ?.remaining_mortgage
    ).toBe(0);
  });

  it('rejects NaN / Infinity in every numeric input', () => {
    const fields = [
      'home_price',
      'down_payment',
      'interest_rate',
      'monthly_rent',
      'property_tax_rate',
      'insurance_annual',
      'hoa_monthly',
      'closing_cost_rate',
      'selling_cost_rate',
      'maintenance_rate',
      'appreciation_rate',
      'rent_growth_rate',
      'investment_return_rate',
    ] as const;
    for (const f of fields) {
      for (const bad of [NaN, Infinity, -Infinity]) {
        expect(() => estimateRentVsBuy({ ...RVB, [f]: bad }), `${f}=${bad}`).toThrow(
          new RegExp(f)
        );
      }
    }
  });
});

describe('calculateMortgage bounds (fleet-audit#661 / #1021)', () => {
  it('rejects NaN / Infinity in every numeric input', () => {
    const fields = [
      'home_price',
      'down_payment',
      'down_payment_percent',
      'interest_rate',
      'loan_term_years',
      'property_tax_annual',
      'property_tax_rate',
      'insurance_annual',
      'hoa_monthly',
      'pmi_rate',
    ] as const;
    for (const f of fields) {
      for (const bad of [NaN, Infinity, -Infinity]) {
        expect(() => calculateMortgage({ ...MORT, [f]: bad }), `${f}=${bad}`).toThrow(
          new RegExp(f)
        );
      }
    }
  });

  it('rejects a loan term above MAX_LOAN_TERM_YEARS or non-integer', () => {
    for (const t of [MAX_LOAN_TERM_YEARS + 1, 15.5]) {
      expect(() => calculateMortgage({ ...MORT, loan_term_years: t })).toThrow(
        /loan_term_years/
      );
    }
    expect(
      calculateMortgage({ ...MORT, loan_term_years: MAX_LOAN_TERM_YEARS })
        .loan_term_years
    ).toBe(MAX_LOAN_TERM_YEARS);
  });

  it('rejects a down payment larger than the home price', () => {
    expect(() =>
      calculateMortgage({ ...MORT, down_payment: MORT.home_price + 1 })
    ).toThrow(/down_payment/);
    expect(() =>
      calculateMortgage({ ...MORT, down_payment_percent: 101 })
    ).toThrow(/down_payment/);
    expect(
      calculateMortgage({ ...MORT, down_payment: MORT.home_price }).loan_amount
    ).toBe(0);
  });
});

describe('calculateAffordability bounds (fleet-audit#661)', () => {
  it('rejects a zero / negative loan term instead of returning NaN', () => {
    for (const t of [0, -5]) {
      expect(() =>
        calculateAffordability({ ...AFF, loan_term_years: t })
      ).toThrow(/loan_term_years/);
    }
  });

  it('rejects a loan term above MAX_LOAN_TERM_YEARS or non-integer', () => {
    for (const t of [MAX_LOAN_TERM_YEARS + 1, 15.5]) {
      expect(() =>
        calculateAffordability({ ...AFF, loan_term_years: t })
      ).toThrow(/loan_term_years/);
    }
  });

  it('rejects NaN / Infinity in every numeric input', () => {
    const fields = [
      'monthly_income',
      'monthly_debts',
      'down_payment',
      'interest_rate',
      'loan_term_years',
      'property_tax_rate',
      'insurance_annual',
      'hoa_monthly',
      'front_end_dti',
      'back_end_dti',
    ] as const;
    for (const f of fields) {
      for (const bad of [NaN, Infinity, -Infinity]) {
        expect(
          () => calculateAffordability({ ...AFF, [f]: bad }),
          `${f}=${bad}`
        ).toThrow(new RegExp(f));
      }
    }
  });

  it('never returns a non-finite max_home_price for valid input', () => {
    const r = calculateAffordability({ ...AFF, loan_term_years: 1 });
    expect(Number.isFinite(r.max_home_price)).toBe(true);
  });
});

describe('tool schemas use the exported loan-term bound', () => {
  it('mortgage schema rejects loan_term_years above MAX_LOAN_TERM_YEARS', () => {
    const schema = mortgageInputSchema(z) as z.ZodType;
    expect(
      schema.safeParse({ ...MORT, loan_term_years: MAX_LOAN_TERM_YEARS }).success
    ).toBe(true);
    expect(
      schema.safeParse({ ...MORT, loan_term_years: MAX_LOAN_TERM_YEARS + 1 })
        .success
    ).toBe(false);
  });

  it('affordability schema rejects loan_term_years above MAX_LOAN_TERM_YEARS', () => {
    const schema = affordabilityInputSchema(z) as z.ZodType;
    expect(
      schema.safeParse({ ...AFF, loan_term_years: MAX_LOAN_TERM_YEARS }).success
    ).toBe(true);
    expect(
      schema.safeParse({ ...AFF, loan_term_years: MAX_LOAN_TERM_YEARS + 1 })
        .success
    ).toBe(false);
  });
});
