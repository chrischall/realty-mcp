import { describe, it, expect } from 'vitest';
import { calculateAffordability } from '../src/affordability.js';

describe('calculateAffordability', () => {
  it('uses front-end DTI as binding constraint for a zero-debt 100k earner', () => {
    // $100k/yr → $8333.33/mo. Front-end cap (28%) = $2333.33.
    // Back-end cap (36%) with zero debts = $3000. Front-end binds.
    const r = calculateAffordability({
      monthly_income: 100_000 / 12,
      monthly_debts: 0,
      down_payment: 40_000,
      interest_rate: 6.5,
      loan_term_years: 30,
      property_tax_rate: 1.1,
      insurance_annual: 1_200,
      hoa_monthly: 0,
    });

    expect(r.binding_constraint).toBe('front_end');
    expect(r.front_end_dti_used).toBe(0.28);
    expect(r.back_end_dti_used).toBe(0.36);
    // Front-end cap = income * 0.28
    expect(r.max_monthly_piti).toBeCloseTo((100_000 / 12) * 0.28, 1);
    // PITI breakdown adds up to within rounding tolerance of the cap.
    const sum =
      r.monthly_principal_interest +
      r.monthly_property_tax +
      r.monthly_insurance +
      r.monthly_hoa;
    expect(sum).toBeCloseTo(r.max_monthly_piti, 0);
    // Sanity bounds — a 100k earner with 40k down at 6.5% on 28/36 should
    // land somewhere between $250k and $450k for max home price.
    expect(r.max_home_price).toBeGreaterThan(250_000);
    expect(r.max_home_price).toBeLessThan(450_000);
    expect(r.loan_amount).toBeCloseTo(r.max_home_price - 40_000, 1);
  });

  it('uses back-end DTI when monthly debts are high', () => {
    // Same 100k earner, but $2000/mo of car/student debts pulls back-end
    // cap down to (8333.33 * 0.36) - 2000 = $1000 — well under front-end.
    const r = calculateAffordability({
      monthly_income: 100_000 / 12,
      monthly_debts: 2_000,
      down_payment: 40_000,
      interest_rate: 6.5,
    });
    expect(r.binding_constraint).toBe('back_end');
    expect(r.max_monthly_piti).toBeCloseTo(
      (100_000 / 12) * 0.36 - 2_000,
      1
    );
  });

  it('handles a zero-interest loan via the n-year amortization fallback', () => {
    // r === 0 path: P&I per month = loan / n. Confirms we don't divide by zero.
    const r = calculateAffordability({
      monthly_income: 10_000,
      monthly_debts: 0,
      down_payment: 50_000,
      interest_rate: 0,
      loan_term_years: 30,
      property_tax_rate: 0,
      insurance_annual: 0,
      hoa_monthly: 0,
    });
    // With r=0, no taxes, no ins, no hoa: max PITI = $2800.
    // loan = 2800 * 360 = $1,008,000. price = 1,008,000 + 50,000.
    expect(r.max_monthly_piti).toBeCloseTo(2_800, 1);
    expect(r.loan_amount).toBeCloseTo(1_008_000, 0);
    expect(r.max_home_price).toBeCloseTo(1_058_000, 0);
    expect(r.monthly_principal_interest).toBeCloseTo(2_800, 1);
  });

  it('includes the down payment additively in the max home price', () => {
    // With a fixed monthly PITI budget, every extra $1 of down payment
    // adds to max_home_price at the rate `factor / (factor + tax/$)`
    // — less than $1 but a sizable fraction (the property-tax term
    // skims a bit off because the bigger price drags tax up too).
    // For a 30y / 6% / 1.1% tax setup that fraction is ~ 0.87.
    const base = calculateAffordability({
      monthly_income: 10_000,
      down_payment: 50_000,
      interest_rate: 6.0,
    });
    const more_down = calculateAffordability({
      monthly_income: 10_000,
      down_payment: 100_000,
      interest_rate: 6.0,
    });
    const delta = more_down.max_home_price - base.max_home_price;
    // Extra cash always raises max_home_price.
    expect(delta).toBeGreaterThan(0);
    // ...and the loan amount drops by enough that max_home_price grows
    // by a meaningful chunk of the down-payment delta (>70%).
    expect(delta).toBeGreaterThan(0.7 * 50_000);
    // ...but never more than the down-payment delta itself (would
    // imply a free lunch on the borrowing side).
    expect(delta).toBeLessThanOrEqual(50_000);
    // And as a corollary, the loan shrinks when you put more cash down.
    expect(more_down.loan_amount).toBeLessThan(base.loan_amount);
  });

  it('respects custom front-end / back-end DTI overrides', () => {
    const r = calculateAffordability({
      monthly_income: 10_000,
      down_payment: 50_000,
      interest_rate: 6.0,
      front_end_dti: 0.31,
      back_end_dti: 0.43,
    });
    expect(r.front_end_dti_used).toBe(0.31);
    expect(r.back_end_dti_used).toBe(0.43);
    // With zero debts, front-end (0.31) binds against back-end (0.43).
    expect(r.binding_constraint).toBe('front_end');
    expect(r.max_monthly_piti).toBeCloseTo(10_000 * 0.31, 1);
  });

  it('throws when monthly_income is zero or negative', () => {
    expect(() =>
      calculateAffordability({
        monthly_income: 0,
        down_payment: 10_000,
        interest_rate: 6,
      })
    ).toThrow(/monthly_income/);
    expect(() =>
      calculateAffordability({
        monthly_income: -1,
        down_payment: 10_000,
        interest_rate: 6,
      })
    ).toThrow(/monthly_income/);
  });

  it('throws when interest_rate is negative', () => {
    expect(() =>
      calculateAffordability({
        monthly_income: 10_000,
        down_payment: 10_000,
        interest_rate: -0.01,
      })
    ).toThrow(/interest_rate/);
  });

  it('throws when down_payment is negative', () => {
    expect(() =>
      calculateAffordability({
        monthly_income: 10_000,
        down_payment: -1,
        interest_rate: 6,
      })
    ).toThrow(/down_payment/);
  });
});
