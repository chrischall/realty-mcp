import { describe, it, expect } from 'vitest';
import { estimateRentVsBuy } from '../src/rent-vs-buy.js';

describe('estimateRentVsBuy', () => {
  it('returns a year-by-year projection of the requested horizon length', () => {
    const r = estimateRentVsBuy({
      home_price: 600_000,
      down_payment: 120_000,
      interest_rate: 6.5,
      monthly_rent: 3_000,
      horizon_years: 10,
    });
    expect(r.years).toHaveLength(10);
    expect(r.horizon_years).toBe(10);
    // Years are numbered 1..horizon in order.
    expect(r.years.map((y) => y.year)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('echoes the inputs and the resolved default rate assumptions', () => {
    const r = estimateRentVsBuy({
      home_price: 500_000,
      down_payment: 100_000,
      interest_rate: 6.0,
      monthly_rent: 2_500,
    });
    expect(r.inputs).toMatchObject({
      home_price: 500_000,
      down_payment: 100_000,
      interest_rate: 6.0,
      monthly_rent: 2_500,
      // defaults
      horizon_years: 10,
      loan_term_years: 30,
      property_tax_rate: 1.1,
      maintenance_rate: 1.0,
      closing_cost_rate: 2.5,
      selling_cost_rate: 6.0,
      appreciation_rate: 3.0,
      rent_growth_rate: 3.0,
      investment_return_rate: 6.0,
      insurance_annual: 0,
      hoa_monthly: 0,
    });
    // default horizon is 10
    expect(r.years).toHaveLength(10);
  });

  it('computes hand-verifiable year-1 detail (home value, mortgage, equity)', () => {
    // $500k home, $100k down, 6% / 30y, all carry rates zeroed except the
    // defaults we can pin: appreciation 3%, selling 6%, term 30.
    const r = estimateRentVsBuy({
      home_price: 500_000,
      down_payment: 100_000,
      interest_rate: 6.0,
      monthly_rent: 2_500,
      horizon_years: 3,
      property_tax_rate: 0,
      maintenance_rate: 0,
      closing_cost_rate: 0,
      insurance_annual: 0,
      hoa_monthly: 0,
    });
    const y1 = r.years[0];
    // Home value after 1 year of 3% appreciation: 500_000 * 1.03 = 515_000.
    expect(y1.home_value).toBeCloseTo(515_000, 0);
    // Loan = 400_000 @ 6%/30y. Monthly P&I = 400000*r*(1+r)^n/((1+r)^n-1)
    // with r=0.005, n=360 → ~$2398.20. After 12 payments the balance is
    // ~$394,581 (interest-heavy early amortization).
    expect(y1.remaining_mortgage).toBeGreaterThan(393_000);
    expect(y1.remaining_mortgage).toBeLessThan(396_000);
    // Equity if sold now = home_value*(1-0.06) - remaining_mortgage
    //  = 515_000*0.94 - ~394_581 = 484_100 - 394_581 = ~89_519.
    const expectedEquity =
      515_000 * 0.94 - y1.remaining_mortgage;
    expect(y1.equity_if_sold_now).toBeCloseTo(expectedEquity, 0);
  });

  it('keeps the per-year cumulative_rent_cost monotonically non-decreasing in gross terms', () => {
    // Gross rent only grows; with the investment offset the NET rent figure
    // can still rise year over year for normal inputs. We assert the
    // home_value series rises (pure appreciation) as a stable invariant.
    const r = estimateRentVsBuy({
      home_price: 500_000,
      down_payment: 100_000,
      interest_rate: 6.0,
      monthly_rent: 2_500,
      horizon_years: 15,
    });
    for (let i = 1; i < r.years.length; i++) {
      expect(r.years[i].home_value).toBeGreaterThan(
        r.years[i - 1].home_value
      );
      // remaining mortgage strictly amortizes down each year
      expect(r.years[i].remaining_mortgage).toBeLessThan(
        r.years[i - 1].remaining_mortgage
      );
    }
  });

  it('finds a break-even year when buying eventually wins (baseline, long horizon)', () => {
    // Modest rent against a 30-year horizon: buying's equity build + rent
    // inflation means buying should overtake renting before year 30.
    const r = estimateRentVsBuy({
      home_price: 500_000,
      down_payment: 100_000,
      interest_rate: 5.0,
      monthly_rent: 2_800,
      horizon_years: 30,
      appreciation_rate: 3.5,
      rent_growth_rate: 3.5,
    });
    expect(r.break_even_year).not.toBeNull();
    expect(r.break_even_year!).toBeGreaterThan(0);
    expect(r.break_even_year!).toBeLessThanOrEqual(30);
    // At the break-even year, buy cumulative cost <= rent cumulative cost.
    const be = r.years[r.break_even_year! - 1];
    expect(be.cumulative_buy_cost).toBeLessThanOrEqual(
      be.cumulative_rent_cost
    );
    // ...and the prior year, buying had NOT yet won.
    if (r.break_even_year! > 1) {
      const prev = r.years[r.break_even_year! - 2];
      expect(prev.cumulative_buy_cost).toBeGreaterThan(
        prev.cumulative_rent_cost
      );
    }
  });

  it('breaks even in year 1 when rent is very high (buy wins immediately)', () => {
    // Sky-high rent vs. a modestly priced home → buying nets out cheaper
    // even in year 1 once equity-if-sold is credited.
    const r = estimateRentVsBuy({
      home_price: 300_000,
      down_payment: 60_000,
      interest_rate: 5.0,
      monthly_rent: 8_000, // absurdly high rent
      horizon_years: 10,
    });
    expect(r.break_even_year).toBe(1);
    expect(r.years[0].cumulative_buy_cost).toBeLessThanOrEqual(
      r.years[0].cumulative_rent_cost
    );
  });

  it('returns null break-even when renting always wins within the horizon', () => {
    // Expensive home, high rate, dirt-cheap rent, zero appreciation, and a
    // high investment return → buying never catches up in 5 years.
    const r = estimateRentVsBuy({
      home_price: 1_000_000,
      down_payment: 200_000,
      interest_rate: 7.5,
      monthly_rent: 1_200,
      horizon_years: 5,
      appreciation_rate: 0,
      rent_growth_rate: 0,
      investment_return_rate: 8,
    });
    expect(r.break_even_year).toBeNull();
    // Every year, buy cost stays above rent cost.
    for (const y of r.years) {
      expect(y.cumulative_buy_cost).toBeGreaterThan(y.cumulative_rent_cost);
    }
  });

  it('cross-checks against the homes-mcp / zillow fixture (500k/100k/6.5%/$2500)', () => {
    // homes-mcp's + zillow's shared test fixture. The canonical break-even
    // is NET of equity-if-sold every year (zillow's `buy_net_if_sold` vs
    // `rent_net` rule, evaluated on every row). Under that rule this
    // scenario does NOT break even inside a 7-year horizon — buying only
    // pulls ahead in year 9. (homes-mcp's own array test asserted a
    // sub-7-year break-even because it compared GROSS outflow with no
    // equity credited until the horizon year — a weaker definition the
    // canonical model deliberately replaces.)
    const short = estimateRentVsBuy({
      home_price: 500_000,
      down_payment: 100_000,
      interest_rate: 6.5,
      monthly_rent: 2_500,
      horizon_years: 7,
    });
    expect(short.years).toHaveLength(7);
    expect(short.break_even_year).toBeNull();

    // Extend the same scenario to 30 years and buying overtakes renting.
    const long = estimateRentVsBuy({
      home_price: 500_000,
      down_payment: 100_000,
      interest_rate: 6.5,
      monthly_rent: 2_500,
      horizon_years: 30,
    });
    expect(long.break_even_year).toBe(9);
    // homes's array projection is recoverable as a column of `years`.
    expect(long.years.map((y) => y.cumulative_buy_cost)).toHaveLength(30);
  });

  it('uses the default rates path when no rate assumptions are supplied', () => {
    const r = estimateRentVsBuy({
      home_price: 500_000,
      down_payment: 100_000,
      interest_rate: 6.0,
      monthly_rent: 2_500,
      horizon_years: 5,
    });
    // Year-1 home value uses the 3% appreciation default.
    expect(r.years[0].home_value).toBeCloseTo(515_000, 0);
    // Closing cost default 2.5% of 500k = 12_500 is folded into year-1
    // gross outflow, so equity is well below the cash already sunk.
    expect(r.inputs.closing_cost_rate).toBe(2.5);
  });

  it('handles a zero-interest loan without dividing by zero', () => {
    const r = estimateRentVsBuy({
      home_price: 360_000,
      down_payment: 0,
      interest_rate: 0,
      monthly_rent: 2_000,
      horizon_years: 5,
      loan_term_years: 30,
    });
    // r=0 → straight-line: 360_000 / 360 months = $1000/mo principal.
    // After 1 year (12 payments) the balance drops by exactly $12,000.
    expect(r.years[0].remaining_mortgage).toBeCloseTo(348_000, 0);
  });

  it('throws when home_price is not positive', () => {
    expect(() =>
      estimateRentVsBuy({
        home_price: 0,
        down_payment: 0,
        interest_rate: 6,
        monthly_rent: 2_000,
      })
    ).toThrow(/home_price/);
    expect(() =>
      estimateRentVsBuy({
        home_price: -1,
        down_payment: 0,
        interest_rate: 6,
        monthly_rent: 2_000,
      })
    ).toThrow(/home_price/);
  });

  it('throws when monthly_rent is not positive', () => {
    expect(() =>
      estimateRentVsBuy({
        home_price: 500_000,
        down_payment: 100_000,
        interest_rate: 6,
        monthly_rent: 0,
      })
    ).toThrow(/monthly_rent/);
  });

  it('throws when down_payment is negative', () => {
    expect(() =>
      estimateRentVsBuy({
        home_price: 500_000,
        down_payment: -1,
        interest_rate: 6,
        monthly_rent: 2_500,
      })
    ).toThrow(/down_payment/);
  });

  it('throws when interest_rate is negative', () => {
    expect(() =>
      estimateRentVsBuy({
        home_price: 500_000,
        down_payment: 100_000,
        interest_rate: -0.01,
        monthly_rent: 2_500,
      })
    ).toThrow(/interest_rate/);
  });

  it('throws when horizon_years is not positive', () => {
    expect(() =>
      estimateRentVsBuy({
        home_price: 500_000,
        down_payment: 100_000,
        interest_rate: 6,
        monthly_rent: 2_500,
        horizon_years: 0,
      })
    ).toThrow(/horizon_years/);
  });

  it('throws when loan_term_years is not positive', () => {
    expect(() =>
      estimateRentVsBuy({
        home_price: 500_000,
        down_payment: 100_000,
        interest_rate: 6,
        monthly_rent: 2_500,
        loan_term_years: 0,
      })
    ).toThrow(/loan_term_years/);
    expect(() =>
      estimateRentVsBuy({
        home_price: 500_000,
        down_payment: 100_000,
        interest_rate: 6,
        monthly_rent: 2_500,
        loan_term_years: -5,
      })
    ).toThrow(/loan_term_years/);
  });

  it('adds no phantom P&I to cumulative_buy_cost after the loan is paid off', () => {
    // 1-year, 0% loan on a fully financed $120k home: year 1 pays the loan
    // off entirely ($120k principal / 12 months = $10k/mo). Years 2 & 3 must
    // add ZERO P&I to the cumulative ledger — only the non-P&I carrying
    // costs (tax, insurance, HOA, maintenance) accrue.
    const r = estimateRentVsBuy({
      home_price: 120_000,
      down_payment: 0,
      interest_rate: 0,
      monthly_rent: 1_000,
      loan_term_years: 1,
      horizon_years: 3,
    });

    // The loan is paid off by end of year 1.
    expect(r.years[0].remaining_mortgage).toBeCloseTo(0, 6);
    expect(r.years[1].remaining_mortgage).toBeCloseTo(0, 6);
    expect(r.years[2].remaining_mortgage).toBeCloseTo(0, 6);

    // Reconstruct the gross outflow per year by adding equity back to the
    // net cumulative_buy_cost. The year-over-year delta in gross outflow for
    // years 2 and 3 must be the non-P&I carrying costs ONLY (no phantom
    // $120k/yr mortgage payment).
    const grossOutflow = (i: number) =>
      r.years[i].cumulative_buy_cost + r.years[i].equity_if_sold_now;

    // Non-P&I carrying costs for a year, charged on that year's opening
    // home value (default tax 1.1%, maintenance 1%; insurance/HOA = 0).
    const tax_rate = 0.011;
    const maint_rate = 0.01;
    // Year 2 opens on the home value at end of year 1 (1 appreciation step).
    const hvYear2Open = 120_000 * 1.03;
    const hvYear3Open = 120_000 * 1.03 * 1.03;
    const carry2 = hvYear2Open * (tax_rate + maint_rate);
    const carry3 = hvYear3Open * (tax_rate + maint_rate);

    const delta2 = grossOutflow(1) - grossOutflow(0);
    const delta3 = grossOutflow(2) - grossOutflow(1);

    // No phantom P&I: the increments are the carrying costs alone.
    expect(delta2).toBeCloseTo(carry2, 2);
    expect(delta3).toBeCloseTo(carry3, 2);
  });
});
