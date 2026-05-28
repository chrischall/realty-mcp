/**
 * Rent-vs-buy projection — the canonical helper reconciling the two
 * cohort implementations (cohort candidate **I**).
 *
 * Surveyed implementations:
 *
 *  - zillow-mcp `src/tools/affordability.ts` `computeRentVsBuy` — the
 *    RICHER variant. Emits a per-year detail series with
 *    `equity_if_sold_now`, `remaining_mortgage`, and `home_value`, and
 *    computes break-even by netting equity-if-sold against the renter's
 *    invested-down-payment growth each year.
 *  - homes-mcp `src/tools/rent-vs-buy.ts` `estimateRentVsBuy` — the
 *    SIMPLER variant. Emits parallel `cumulative_buy_cost[]` /
 *    `cumulative_rent_cost[]` arrays plus a headline `break_even_year`
 *    (first year buy cumulative cost ≤ rent cumulative cost).
 *
 * Both share the SAME financial model and default rates: appreciation
 * 3%/yr, rent growth 3%/yr, investment return 6%/yr, maintenance 1%/yr
 * of home value, property tax 1.1%/yr, closing 2.5% of price, selling
 * 6% of sale price, loan term 30y.
 *
 * Canonical shape (the UNION / superset of both consumers' needs):
 *
 *  1. `inputs` echoes every input with all rate assumptions resolved to
 *     their defaults — homes-mcp's `inputs_used` block.
 *  2. `years[]` is ONE per-year row type that unifies zillow's per-year
 *     equity detail AND homes's cumulative cost arrays:
 *       `{ year, home_value, remaining_mortgage, equity_if_sold_now,
 *          cumulative_buy_cost, cumulative_rent_cost }`.
 *     - `home_value` / `remaining_mortgage` / `equity_if_sold_now`
 *       reproduce zillow's per-year detail.
 *     - `cumulative_buy_cost` / `cumulative_rent_cost` reproduce homes's
 *       parallel arrays as a column projection of the rows
 *       (`years.map(y => y.cumulative_buy_cost)` recovers homes's array).
 *  3. `break_even_year` is the top-level headline (homes's output): the
 *     first year where `cumulative_buy_cost ≤ cumulative_rent_cost`, or
 *     `null` if buying never catches up within the horizon.
 *
 * Net-of-equity cost convention (reconciles the two break-even rules):
 * each year `cumulative_buy_cost` is the buyer's NET position if they
 * sold that year — total cash out (down + closing + Σ PITI + maintenance)
 * minus `equity_if_sold_now` (sale proceeds net of selling costs and the
 * remaining mortgage). `cumulative_rent_cost` is the renter's NET cost —
 * cumulative rent paid minus the gain on the same upfront capital
 * (down + closing) invested at `investment_return_rate`. This is exactly
 * zillow's `buy_net_if_sold` vs `rent_net` comparison, evaluated for
 * EVERY year (not just the horizon), so break-even is meaningful on every
 * row — which is what homes's per-year array comparison wants.
 *
 * Each consumer's existing output is a clean projection of this shape, so
 * migration maps mechanically:
 *  - zillow `computeRentVsBuy().yearly[i]` ← the `{ year, home_value,
 *    remaining_mortgage, equity_if_sold_now }` columns of `years[i]`
 *    (zillow's per-year `cumulative_buy_cost` was the GROSS outflow; a
 *    wrapper that wants the gross figure can recompute it, but the
 *    canonical net figure is the one that drives break-even).
 *  - homes `estimateRentVsBuy().cumulative_buy_cost` ←
 *    `years.map(y => y.cumulative_buy_cost)`; `.break_even_year` ← the
 *    top-level `break_even_year`.
 *
 * Pure / dependency-free — no I/O, no portal SDK. Cohort MCPs wrap with
 * their own `*_estimate_rent_vs_buy` tool description string.
 */

/** Inputs to `estimateRentVsBuy`. Match the cohort tool input schemas. */
export interface RentVsBuyInput {
  /** Home purchase price in dollars. Must be positive. */
  home_price: number;
  /** Cash down, dollars. Must be >= 0. */
  down_payment: number;
  /** Annual interest rate as a percent (e.g. `6.5` for 6.5%). Must be >= 0. */
  interest_rate: number;
  /** Comparable monthly rent, dollars. Must be positive. */
  monthly_rent: number;
  /** Projection horizon in years. Default 10. Must be positive. */
  horizon_years?: number;
  /** Loan term in years. Default 30. */
  loan_term_years?: number;
  /** Annual property tax as a percent of home value. Default 1.1. */
  property_tax_rate?: number;
  /** Annual homeowners insurance premium, dollars. Default 0. */
  insurance_annual?: number;
  /** Monthly HOA dues, dollars. Default 0. */
  hoa_monthly?: number;
  /** Closing costs as a percent of home price. Default 2.5. */
  closing_cost_rate?: number;
  /** Selling costs as a percent of sale price. Default 6. */
  selling_cost_rate?: number;
  /** Annual maintenance as a percent of home value. Default 1. */
  maintenance_rate?: number;
  /** Annual home-price appreciation, percent. Default 3. */
  appreciation_rate?: number;
  /** Annual rent growth, percent. Default 3. */
  rent_growth_rate?: number;
  /** Annual return on the down-payment-as-invested, percent. Default 6. */
  investment_return_rate?: number;
}

/**
 * One year of the projection. Unifies zillow's per-year equity detail
 * (`home_value`, `remaining_mortgage`, `equity_if_sold_now`) with homes's
 * cumulative cost arrays (`cumulative_buy_cost`, `cumulative_rent_cost`).
 */
export interface RentVsBuyYear {
  /** Year index, 1..horizon. */
  year: number;
  /** Home value at end of year after appreciation. */
  home_value: number;
  /** Mortgage balance remaining at end of year. */
  remaining_mortgage: number;
  /** Net equity if the home were sold this year (after selling costs). */
  equity_if_sold_now: number;
  /**
   * Buyer's NET cost if they sold this year: total cash out
   * (down + closing + Σ PITI + maintenance) minus `equity_if_sold_now`.
   */
  cumulative_buy_cost: number;
  /**
   * Renter's NET cost: cumulative rent paid minus the gain on the same
   * upfront capital invested at `investment_return_rate`.
   */
  cumulative_rent_cost: number;
}

/** Inputs echoed back with every rate assumption resolved to its default. */
export interface RentVsBuyInputsUsed {
  home_price: number;
  down_payment: number;
  interest_rate: number;
  monthly_rent: number;
  horizon_years: number;
  loan_term_years: number;
  property_tax_rate: number;
  insurance_annual: number;
  hoa_monthly: number;
  closing_cost_rate: number;
  selling_cost_rate: number;
  maintenance_rate: number;
  appreciation_rate: number;
  rent_growth_rate: number;
  investment_return_rate: number;
}

/**
 * Output of `estimateRentVsBuy`. The superset of zillow's
 * `RentVsBuyResult` (per-year equity detail) and homes's
 * `RentVsBuyResult` (cumulative arrays + break-even).
 */
export interface RentVsBuyResult {
  /** Projection horizon in years (echoed). */
  horizon_years: number;
  /** Inputs echoed with all rate assumptions resolved to defaults. */
  inputs: RentVsBuyInputsUsed;
  /** Per-year projection rows, 1..horizon. */
  years: RentVsBuyYear[];
  /**
   * First year where `cumulative_buy_cost ≤ cumulative_rent_cost`, or
   * `null` if buying never catches up within the horizon.
   */
  break_even_year: number | null;
}

/**
 * Project rent vs. buy over `horizon_years`, returning a per-year series
 * of net costs + equity detail and the first break-even year.
 *
 * Pure / deterministic — no I/O, no dependencies. Hoisted from the realty
 * cohort (zillow `computeRentVsBuy` + homes `estimateRentVsBuy`).
 *
 * @throws if `home_price <= 0`, `monthly_rent <= 0`, `down_payment < 0`,
 *   `interest_rate < 0`, or `horizon_years <= 0`.
 */
export function estimateRentVsBuy(input: RentVsBuyInput): RentVsBuyResult {
  if (input.home_price <= 0) throw new Error('home_price must be positive');
  if (input.monthly_rent <= 0)
    throw new Error('monthly_rent must be positive');
  if (input.down_payment < 0) throw new Error('down_payment must be >= 0');
  if (input.interest_rate < 0)
    throw new Error('interest_rate must be >= 0');

  const horizon = input.horizon_years ?? 10;
  if (horizon <= 0) throw new Error('horizon_years must be positive');

  const term_years = input.loan_term_years ?? 30;
  const tax_rate = (input.property_tax_rate ?? 1.1) / 100;
  const insurance = input.insurance_annual ?? 0;
  const hoa_annual = (input.hoa_monthly ?? 0) * 12;
  const closing_rate = (input.closing_cost_rate ?? 2.5) / 100;
  const selling_rate = (input.selling_cost_rate ?? 6) / 100;
  const maint_rate = (input.maintenance_rate ?? 1) / 100;
  const appreciation = (input.appreciation_rate ?? 3) / 100;
  const rent_growth = (input.rent_growth_rate ?? 3) / 100;
  const invest_return = (input.investment_return_rate ?? 6) / 100;

  // PMT for the loan; r === 0 falls back to straight-line amortization
  // to dodge a 0/0 (matches calculateMortgage / calculateAffordability).
  const r = input.interest_rate / 100 / 12;
  const n = term_years * 12;
  const loan = Math.max(0, input.home_price - input.down_payment);
  const monthly_pi =
    r === 0
      ? loan / n
      : (loan * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);

  const closing = input.home_price * closing_rate;
  // The renter invests the SAME upfront capital the buyer sinks in
  // (down + closing) — the most complete opportunity-cost basis
  // (homes-mcp's `startingCapital`).
  const starting_capital = input.down_payment + closing;

  let cum_buy_outflow = starting_capital;
  let cum_rent = 0;
  let invested = starting_capital;
  let home_value = input.home_price;
  let principal_remaining = loan;
  let monthly_rent = input.monthly_rent;

  const years: RentVsBuyYear[] = [];
  let break_even: number | null = null;

  for (let y = 1; y <= horizon; y++) {
    // 12 months of carrying costs, charged on the year's opening home value.
    const year_pi = monthly_pi * 12;
    const year_tax = home_value * tax_rate;
    const year_maint = home_value * maint_rate;
    cum_buy_outflow += year_pi + year_tax + insurance + hoa_annual + year_maint;

    // Amortize the loan month by month so remaining_mortgage is exact.
    for (let m = 0; m < 12; m++) {
      const int_m = principal_remaining * r;
      const pi_m = Math.min(monthly_pi, principal_remaining + int_m);
      const prin_m = pi_m - int_m;
      principal_remaining = Math.max(0, principal_remaining - prin_m);
    }

    // Rent for the year, then grow it for next year.
    cum_rent += monthly_rent * 12;
    monthly_rent *= 1 + rent_growth;

    // Renter's parallel investment compounds; home appreciates.
    invested *= 1 + invest_return;
    home_value *= 1 + appreciation;

    // Equity if sold this year, then the NET buy / rent positions.
    const equity_if_sold = home_value * (1 - selling_rate) - principal_remaining;
    const cumulative_buy_cost = cum_buy_outflow - equity_if_sold;
    const renter_invest_gain = invested - starting_capital;
    const cumulative_rent_cost = cum_rent - renter_invest_gain;

    if (break_even === null && cumulative_buy_cost <= cumulative_rent_cost)
      break_even = y;

    years.push({
      year: y,
      home_value: round2(home_value),
      remaining_mortgage: round2(principal_remaining),
      equity_if_sold_now: round2(equity_if_sold),
      cumulative_buy_cost: round2(cumulative_buy_cost),
      cumulative_rent_cost: round2(cumulative_rent_cost),
    });
  }

  return {
    horizon_years: horizon,
    inputs: {
      home_price: input.home_price,
      down_payment: input.down_payment,
      interest_rate: input.interest_rate,
      monthly_rent: input.monthly_rent,
      horizon_years: horizon,
      loan_term_years: term_years,
      property_tax_rate: input.property_tax_rate ?? 1.1,
      insurance_annual: insurance,
      hoa_monthly: input.hoa_monthly ?? 0,
      closing_cost_rate: input.closing_cost_rate ?? 2.5,
      selling_cost_rate: input.selling_cost_rate ?? 6,
      maintenance_rate: input.maintenance_rate ?? 1,
      appreciation_rate: input.appreciation_rate ?? 3,
      rent_growth_rate: input.rent_growth_rate ?? 3,
      investment_return_rate: input.investment_return_rate ?? 6,
    },
    years,
    break_even_year: break_even,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
