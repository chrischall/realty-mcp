import { describe, it, expect } from 'vitest';
import { calculateMortgage } from '../src/mortgage.js';

describe('calculateMortgage', () => {
  it('returns a PITI breakdown at 6.5% / 30yr / 20% down', () => {
    // $400,000 home, 20% down → $320,000 loan
    // 6.5% / 12 = 0.005416..., n = 360
    // M = 320000 * r * (1+r)^n / ((1+r)^n - 1) ≈ $2,022.62
    const r = calculateMortgage({
      home_price: 400_000,
      interest_rate: 6.5,
    });
    expect(r.home_price).toBe(400_000);
    expect(r.down_payment).toBe(80_000);
    expect(r.loan_amount).toBe(320_000);
    expect(r.loan_term_years).toBe(30);
    expect(r.interest_rate).toBe(6.5);
    expect(r.monthly_principal_interest).toBeCloseTo(2022.62, 1);
    expect(r.monthly_property_tax).toBe(0);
    expect(r.monthly_insurance).toBe(0);
    expect(r.monthly_hoa).toBe(0);
    expect(r.monthly_pmi).toBe(0);
    expect(r.monthly_total).toBeCloseTo(2022.62, 1);
    // Total paid over 360 months minus principal = interest.
    // Use the unrounded P&I to derive the expectation (since the
    // breakdown rounds each cell to 2dp but the totals are computed
    // off the precise monthly value).
    expect(r.total_paid_over_loan).toBeCloseTo(
      r.monthly_principal_interest * 360,
      -1
    );
    expect(r.total_interest_paid).toBeCloseTo(
      r.monthly_principal_interest * 360 - 320_000,
      -1
    );
    // LTV is reported as a percent (0-100), matching the zillow shape
    // (which is the most complete cohort reference). 80% down here.
    expect(r.ltv_percent).toBe(80);
  });

  it('handles zero-interest edge case via straight-line amortization', () => {
    // 0% interest: monthly P&I = loan / n_months, no curvature.
    const r = calculateMortgage({
      home_price: 120_000,
      down_payment: 0,
      interest_rate: 0,
      loan_term_years: 10,
    });
    expect(r.loan_amount).toBe(120_000);
    expect(r.monthly_principal_interest).toBeCloseTo(120_000 / 120, 4);
    expect(r.total_interest_paid).toBeCloseTo(0, 4);
    expect(r.total_paid_over_loan).toBeCloseTo(120_000, 4);
  });

  it('applies PMI when LTV > 80%', () => {
    // 10% down → 90% LTV → PMI kicks in.
    const r = calculateMortgage({
      home_price: 500_000,
      down_payment_percent: 10,
      interest_rate: 6.5,
      pmi_rate: 0.5,
    });
    expect(r.ltv_percent).toBe(90);
    expect(r.monthly_pmi).toBeGreaterThan(0);
    // PMI = loan * pmi_rate% / 12 = 450000 * 0.005 / 12 = 187.50
    expect(r.monthly_pmi).toBeCloseTo(187.5, 2);
  });

  it('does NOT apply PMI at or below 80% LTV', () => {
    // Exactly 20% down → 80% LTV → no PMI (LTV must be > 80, not >=).
    const r = calculateMortgage({
      home_price: 500_000,
      down_payment_percent: 20,
      interest_rate: 6.5,
      pmi_rate: 0.5,
    });
    expect(r.ltv_percent).toBe(80);
    expect(r.monthly_pmi).toBe(0);

    // 25% down → 75% LTV → also no PMI.
    const r2 = calculateMortgage({
      home_price: 500_000,
      down_payment_percent: 25,
      interest_rate: 6.5,
      pmi_rate: 0.5,
    });
    expect(r2.ltv_percent).toBe(75);
    expect(r2.monthly_pmi).toBe(0);
  });

  it('lets down_payment override down_payment_percent when both are provided', () => {
    const r = calculateMortgage({
      home_price: 400_000,
      down_payment: 100_000, // wins
      down_payment_percent: 50, // ignored
      interest_rate: 6.5,
    });
    expect(r.down_payment).toBe(100_000);
    expect(r.loan_amount).toBe(300_000);
    expect(r.ltv_percent).toBe(75);
  });

  it('decomposes property_tax_rate to monthly via home_price', () => {
    // 1.2% annual property tax on $400k home → $4800/yr → $400/mo.
    const r = calculateMortgage({
      home_price: 400_000,
      interest_rate: 6.5,
      property_tax_rate: 1.2,
    });
    expect(r.monthly_property_tax).toBeCloseTo(400, 2);
  });

  it('prefers property_tax_annual over property_tax_rate when both are provided', () => {
    const r = calculateMortgage({
      home_price: 400_000,
      interest_rate: 6.5,
      property_tax_annual: 6000, // → $500/mo
      property_tax_rate: 1.2, // would be $400/mo
    });
    expect(r.monthly_property_tax).toBeCloseTo(500, 2);
  });

  it('rolls insurance + HOA into monthly_total', () => {
    const r = calculateMortgage({
      home_price: 400_000,
      interest_rate: 6.5,
      insurance_annual: 1200, // → $100/mo
      hoa_monthly: 250,
    });
    expect(r.monthly_insurance).toBeCloseTo(100, 2);
    expect(r.monthly_hoa).toBeCloseTo(250, 2);
    expect(r.monthly_total).toBeCloseTo(
      r.monthly_principal_interest + 100 + 250,
      2
    );
  });

  it('throws on negative interest_rate', () => {
    expect(() =>
      calculateMortgage({ home_price: 400_000, interest_rate: -1 })
    ).toThrow(/interest_rate/);
  });

  it('throws on non-positive home_price', () => {
    expect(() =>
      calculateMortgage({ home_price: 0, interest_rate: 6.5 })
    ).toThrow(/home_price/);
    expect(() =>
      calculateMortgage({ home_price: -1, interest_rate: 6.5 })
    ).toThrow(/home_price/);
  });

  it('throws on non-positive loan_term_years', () => {
    expect(() =>
      calculateMortgage({
        home_price: 400_000,
        interest_rate: 6.5,
        loan_term_years: 0,
      })
    ).toThrow(/loan_term_years/);
    expect(() =>
      calculateMortgage({
        home_price: 400_000,
        interest_rate: 6.5,
        loan_term_years: -5,
      })
    ).toThrow(/loan_term_years/);
  });
});
