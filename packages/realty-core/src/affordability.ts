/**
 * Max-affordable-home-price under the standard 28/36 DTI rule.
 *
 * Hoisted from every realty cohort MCP — each one (`zillow-mcp`,
 * `redfin-mcp`, `compass-mcp`, `homes-mcp`, `onehome-mcp`) ships a
 * `*_calculate_affordability` tool whose math is identical to the
 * digit. zillow's 240 extra lines are explanation strings and
 * bucket breakdowns — trivial to layer as a portal-specific wrapper
 * on top of this pure core.
 *
 * The math: invert PMT against two constraints, pick the binding one.
 *
 *   front-end cap  =  income * front_end_dti
 *   back-end cap   =  income * back_end_dti − monthly_debts
 *   max_piti       =  min(front, back)   ← binding constraint
 *
 *   PITI = P&I + tax + insurance + HOA
 *        = loan * factor + price * (tax/$) + ins + hoa
 *        = loan * factor + (loan + down) * (tax/$) + ins + hoa
 *
 *   Solve for `loan`:
 *
 *     max_piti − ins − hoa − down*(tax/$)
 *   ────────────────────────────────────────  =  loan
 *           factor + (tax/$)
 *
 *   max_home_price = loan + down_payment
 *
 * where `factor = r(1+r)^n / ((1+r)^n − 1)` is the standard PMT
 * coefficient for monthly rate `r` and term-months `n`. The `r === 0`
 * branch falls back to straight-line amortization (`1/n`) to avoid a
 * 0/0.
 *
 * Pure function — no I/O, no portal SDK. Cohort MCPs wrap with their
 * own `*_calculate_affordability` tool description string.
 */

export interface AffordabilityInput {
  /** Borrower's gross monthly income, dollars. Must be > 0. */
  monthly_income: number;
  /** Recurring monthly debt service (car / student / minimum CC). Default 0. */
  monthly_debts?: number;
  /** Cash down, dollars. Must be >= 0. */
  down_payment: number;
  /** Annual interest rate as a percent (e.g. `6.5` for 6.5%). Must be >= 0. */
  interest_rate: number;
  /** Loan term in years. Default 30. */
  loan_term_years?: number;
  /** Annual property tax as a percent of home price (e.g. `1.1`). Default 1.1. */
  property_tax_rate?: number;
  /** Annual homeowners insurance premium, dollars. Default 0. */
  insurance_annual?: number;
  /** Monthly HOA dues, dollars. Default 0. */
  hoa_monthly?: number;
  /** Front-end (housing / income) DTI cap as decimal. Default 0.28. */
  front_end_dti?: number;
  /** Back-end ((housing + debts) / income) DTI cap as decimal. Default 0.36. */
  back_end_dti?: number;
}

export interface AffordabilityResult {
  max_home_price: number;
  max_monthly_piti: number;
  binding_constraint: 'front_end' | 'back_end';
  monthly_principal_interest: number;
  monthly_property_tax: number;
  monthly_insurance: number;
  monthly_hoa: number;
  loan_amount: number;
  down_payment: number;
  front_end_dti_used: number;
  back_end_dti_used: number;
}

/**
 * Solve for the maximum home price the borrower can afford under the
 * 28/36 DTI rule (or custom DTI caps via `front_end_dti` / `back_end_dti`).
 *
 * @throws if `monthly_income <= 0`, `down_payment < 0`, or `interest_rate < 0`.
 */
export function calculateAffordability(
  input: AffordabilityInput
): AffordabilityResult {
  if (input.monthly_income <= 0)
    throw new Error('monthly_income must be positive');
  if (input.down_payment < 0) throw new Error('down_payment must be >= 0');
  if (input.interest_rate < 0)
    throw new Error('interest_rate must be >= 0');

  const term_years = input.loan_term_years ?? 30;
  const monthly_debts = input.monthly_debts ?? 0;
  const front_dti = input.front_end_dti ?? 0.28;
  const back_dti = input.back_end_dti ?? 0.36;
  const tax_rate = input.property_tax_rate ?? 1.1;
  const insurance_annual = input.insurance_annual ?? 0;
  const hoa_monthly = input.hoa_monthly ?? 0;

  // Max PITI under each DTI cap. Whichever is lower binds.
  const front_max = input.monthly_income * front_dti;
  const back_max = input.monthly_income * back_dti - monthly_debts;
  const max_piti = Math.max(0, Math.min(front_max, back_max));
  const binding: 'front_end' | 'back_end' =
    front_max <= back_max ? 'front_end' : 'back_end';

  // Strip out the price-independent components (insurance, HOA) and
  // fold the price-linear property-tax term into the per-$1 coefficient.
  const monthly_ins = insurance_annual / 12;
  const monthly_tax_per_dollar = tax_rate / 100 / 12;
  const monthly_pi_budget = Math.max(
    0,
    max_piti - monthly_ins - hoa_monthly
  );

  // PMT factor for a $1 loan at monthly rate `r` over `n` months.
  // The r === 0 branch is straight-line amortization to dodge 0/0.
  const r = input.interest_rate / 100 / 12;
  const n = term_years * 12;
  const factor =
    r === 0 ? 1 / n : (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  // Closed-form inversion. `coeff` can't actually hit zero in normal
  // input ranges (factor > 0 always), but the guard is cheap.
  const coeff = monthly_tax_per_dollar + factor;
  const max_home_price =
    coeff === 0
      ? input.down_payment
      : (monthly_pi_budget + input.down_payment * factor) / coeff;

  const loan_amount = Math.max(0, max_home_price - input.down_payment);
  const monthly_pi = r === 0 ? loan_amount / n : loan_amount * factor;
  const monthly_tax = max_home_price * monthly_tax_per_dollar;

  return {
    max_home_price: round2(max_home_price),
    max_monthly_piti: round2(max_piti),
    binding_constraint: binding,
    monthly_principal_interest: round2(monthly_pi),
    monthly_property_tax: round2(monthly_tax),
    monthly_insurance: round2(monthly_ins),
    monthly_hoa: round2(hoa_monthly),
    loan_amount: round2(loan_amount),
    down_payment: round2(input.down_payment),
    front_end_dti_used: front_dti,
    back_end_dti_used: back_dti,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
