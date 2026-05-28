/**
 * Local mortgage / PITI calculator — the canonical helper reconciling
 * five cohort implementations.
 *
 * Surveyed implementations:
 *
 *  - zillow-mcp `src/tools/mortgage.ts` `computeMortgage` — the most
 *    complete output shape (loan_amount, down_payment, monthly_*,
 *    monthly_total, total_interest_paid, total_paid_over_loan,
 *    loan_term_years, interest_rate, ltv_percent as 0..100).
 *  - redfin-mcp `src/tools/mortgage.ts` — line-for-line identical to
 *    zillow's.
 *  - compass-mcp `src/tools/mortgage.ts` — leaner inline shape:
 *    `monthly_total_piti`, `total_interest_over_term`, `ltv` as a
 *    0..1 ratio, no `interest_rate` echo. Same math.
 *  - homes-mcp `src/tools/mortgage.ts` — line-for-line copy of compass.
 *  - onehome-mcp `src/tools/mortgage.ts` — copy of compass minus one
 *    field, same math.
 *
 * Canonical policy (union over the cohort):
 *
 *  1. PMT formula: M = P * r * (1+r)^n / ((1+r)^n - 1). Guard the
 *     zero-interest case with straight-line amortization (M = P/n) so
 *     the formula stays finite at r = 0.
 *  2. Defaults: `loan_term_years = 30`, `down_payment_percent = 20`
 *     when neither `down_payment` nor `down_payment_percent` is given.
 *  3. `down_payment` overrides `down_payment_percent` when both are
 *     provided (the zillow precedence).
 *  4. `property_tax_annual` overrides `property_tax_rate` when both
 *     are provided; `property_tax_rate` decomposes via `home_price`.
 *  5. PMI applies strictly above 80% LTV (> 80, not >=) and only when
 *     `pmi_rate` is provided.
 *  6. LTV is reported as a percent (0..100), matching the zillow shape.
 *  7. Output shape carries the zillow union (most complete) plus
 *     `home_price` (echoed from input, matches the compass/homes/
 *     onehome variant) so each cohort wrapper can map cleanly.
 *  8. Validation: `home_price` must be positive, `interest_rate` must
 *     be non-negative, `loan_term_years` must be positive.
 */

/**
 * Inputs to `calculateMortgage`. Match the cohort's
 * `*_calculate_mortgage` tool input schema.
 */
export interface MortgageInput {
  /** Home purchase price in dollars. Must be positive. */
  home_price: number;
  /** Down payment in dollars. Overrides `down_payment_percent`. */
  down_payment?: number;
  /** Down payment as a percent of `home_price` (0..100). Default 20. */
  down_payment_percent?: number;
  /** Annual interest rate as a percent (e.g. 6.5 for 6.5%). */
  interest_rate: number;
  /** Loan term in years. Default 30. */
  loan_term_years?: number;
  /** Annual property tax in dollars. Overrides `property_tax_rate`. */
  property_tax_annual?: number;
  /** Property tax as a percent of `home_price` annually (0..100). */
  property_tax_rate?: number;
  /** Annual homeowner's insurance in dollars. */
  insurance_annual?: number;
  /** Monthly HOA dues in dollars. */
  hoa_monthly?: number;
  /** PMI as an annual percent of the loan balance (0..100). */
  pmi_rate?: number;
}

/**
 * Output of `calculateMortgage`. Carries the full PITI breakdown plus
 * loan-level totals.
 */
export interface MortgageBreakdown {
  /** Home purchase price (echoed from input). */
  home_price: number;
  /** Down payment in dollars. */
  down_payment: number;
  /** Loan principal (home_price - down_payment). */
  loan_amount: number;
  /** Monthly P&I (principal + interest). */
  monthly_principal_interest: number;
  /** Monthly property tax. */
  monthly_property_tax: number;
  /** Monthly insurance. */
  monthly_insurance: number;
  /** Monthly HOA dues. */
  monthly_hoa: number;
  /** Monthly PMI. Zero when LTV ≤ 80% or `pmi_rate` is not provided. */
  monthly_pmi: number;
  /** Sum of all monthly components — full PITI + HOA + PMI. */
  monthly_total: number;
  /** Total interest paid over the life of the loan. */
  total_interest_paid: number;
  /** Total dollars paid over the life of the loan (P&I only). */
  total_paid_over_loan: number;
  /** Loan term in years (echoed from input or default 30). */
  loan_term_years: number;
  /** Annual interest rate as a percent (echoed from input). */
  interest_rate: number;
  /** Loan-to-value as a percent (0..100). */
  ltv_percent: number;
}

/**
 * Compute a PITI breakdown from a mortgage scenario. Pure / deterministic
 * — no I/O, no dependencies. Hoisted from the realty cohort
 * (zillow/redfin/compass/homes/onehome).
 */
export function calculateMortgage(input: MortgageInput): MortgageBreakdown {
  if (input.home_price <= 0) {
    throw new Error('home_price must be positive');
  }
  if (input.interest_rate < 0) {
    throw new Error('interest_rate must be non-negative');
  }
  const term_years = input.loan_term_years ?? 30;
  if (term_years <= 0) {
    throw new Error('loan_term_years must be positive');
  }

  // down_payment wins over down_payment_percent (zillow precedence).
  // Falls back to 20% when neither is provided.
  const down =
    input.down_payment !== undefined
      ? input.down_payment
      : input.down_payment_percent !== undefined
        ? (input.home_price * input.down_payment_percent) / 100
        : input.home_price * 0.2;
  if (down < 0) {
    throw new Error('down_payment must be non-negative');
  }
  const loan = Math.max(0, input.home_price - down);

  const monthly_rate = input.interest_rate / 100 / 12;
  const n_months = term_years * 12;

  // Amortization formula. Guard rate==0 (straight-line / no-interest).
  let monthly_pi: number;
  if (monthly_rate === 0) {
    monthly_pi = loan / n_months;
  } else {
    const factor = Math.pow(1 + monthly_rate, n_months);
    monthly_pi = (loan * monthly_rate * factor) / (factor - 1);
  }

  // property_tax_annual wins over property_tax_rate.
  const monthly_tax =
    input.property_tax_annual !== undefined
      ? input.property_tax_annual / 12
      : input.property_tax_rate !== undefined
        ? (input.home_price * input.property_tax_rate) / 100 / 12
        : 0;
  const monthly_ins = (input.insurance_annual ?? 0) / 12;
  const monthly_hoa = input.hoa_monthly ?? 0;

  // PMI applies strictly above 80% LTV.
  const ltv = (loan / input.home_price) * 100;
  const monthly_pmi =
    input.pmi_rate !== undefined && ltv > 80
      ? (loan * input.pmi_rate) / 100 / 12
      : 0;

  const total_interest = monthly_pi * n_months - loan;
  const total_paid = monthly_pi * n_months;

  // Round each cell, then sum the rounded values for the total so
  // callers reconstructing the total from cells get exact equality.
  const r_pi = round2(monthly_pi);
  const r_tax = round2(monthly_tax);
  const r_ins = round2(monthly_ins);
  const r_hoa = round2(monthly_hoa);
  const r_pmi = round2(monthly_pmi);
  return {
    home_price: input.home_price,
    down_payment: round2(down),
    loan_amount: round2(loan),
    monthly_principal_interest: r_pi,
    monthly_property_tax: r_tax,
    monthly_insurance: r_ins,
    monthly_hoa: r_hoa,
    monthly_pmi: r_pmi,
    monthly_total: round2(r_pi + r_tax + r_ins + r_hoa + r_pmi),
    total_interest_paid: round2(total_interest),
    total_paid_over_loan: round2(total_paid),
    loan_term_years: term_years,
    interest_rate: input.interest_rate,
    ltv_percent: round2(ltv),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
