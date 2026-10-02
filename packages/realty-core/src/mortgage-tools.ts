/**
 * MCP tool registrars for the local mortgage + affordability calculators
 * (fleet-audit#1090).
 *
 * The math was already canonical here (`calculateMortgage`,
 * `calculateAffordability`), but every cohort MCP still carried its own
 * `tools/mortgage.ts` + `tools/affordability.ts`: the same zod schemas,
 * the same descriptions modulo the portal name, and — in homes / compass
 * / onehome — the same hand-written projection onto a leaner output
 * shape. A schema fix needed five PRs. These registrars own all of it;
 * a consumer's file collapses to one call each.
 *
 * Surveyed copies (`src/tools/mortgage.ts`, `src/tools/affordability.ts`):
 *
 *  - redfin-mcp — canonical output shape (realty-core `MortgageBreakdown`).
 *  - zillow-mcp — canonical shape minus the echoed `home_price`.
 *    Adopting `shape: 'canonical'` ADDS `home_price` (additive only).
 *  - homes-mcp / compass-mcp / onehome-mcp — the lean shape
 *    (`ltv` 0..1, `monthly_total_piti`, `total_interest_over_term`, no
 *    `interest_rate` / `total_paid_over_loan`) → `shape: 'lean'`.
 *
 * Drift resolved (strictest wins):
 *  - DTI caps: zillow/redfin `.positive().max(1)`; homes/compass/onehome
 *    `.min(0).max(1)`. A 0 cap makes every price unaffordable, so the
 *    strict `positive()` bound is canonical.
 *  - Field descriptions: zillow's (defaults spelled out: 30-year term,
 *    1.1% tax rate, 0.28 / 0.36 DTI) — the richest copy.
 *  - `down_payment_percent`: `.nonnegative().max(100)` and
 *    `.min(0).max(100)` are the same bound.
 *  - Tool description: one portal-neutral text; the copies differed only
 *    in the portal name / sibling-MCP mentions and backticks.
 *
 * Dependency-free: the consumer passes its own `z` and `McpServer` (see
 * `tool-types.ts`).
 */
import { calculateMortgage, type MortgageBreakdown, type MortgageInput } from './mortgage.js';
import { calculateAffordability, type AffordabilityInput } from './affordability.js';
import {
  jsonToolResult,
  type ToolResultLike,
  type ToolServerLike,
  type ZodLike,
} from './tool-types.js';

/** Output shape of the mortgage tool. */
export type MortgageToolShape = 'canonical' | 'lean';

/** Common options for both registrars. */
export interface CalculatorToolOptions {
  /** The consumer's zod namespace (`import { z } from 'zod'`). */
  z: ZodLike;
  /** Tool-name prefix, e.g. `'zillow'` → `zillow_calculate_mortgage`. */
  prefix: string;
  /** Full tool-name override (wins over `prefix`). */
  name?: string;
  /** Title override (also used as `annotations.title`). */
  title?: string;
  /** Description override. */
  description?: string;
  /**
   * Result wrapper. Defaults to {@link jsonToolResult} (byte-identical to
   * mcp-utils' `minifiedResult`).
   */
  toResult?: (data: unknown) => ToolResultLike;
}

export interface MortgageToolOptions extends CalculatorToolOptions {
  /**
   * `'canonical'` (default) returns realty-core's `MortgageBreakdown`;
   * `'lean'` returns {@link LeanMortgageResult}.
   */
  shape?: MortgageToolShape;
}

export const MORTGAGE_TOOL_TITLE = 'Calculate mortgage payment (local)';

export const MORTGAGE_TOOL_DESCRIPTION =
  'Local-only mortgage payment calculator. Returns a full PITI breakdown (principal + interest, property tax, insurance, HOA, PMI) and total interest over the life of the loan. No network call — fully deterministic, safe to use for scenario comparison without burning a fetch. Provide either `down_payment` OR `down_payment_percent`; defaults to 20%. Property tax can be given as `property_tax_annual` or `property_tax_rate` (% of home price). PMI applies automatically when LTV > 80% and `pmi_rate` is provided.';

export const AFFORDABILITY_TOOL_TITLE = 'Calculate max affordable home price';

export const AFFORDABILITY_TOOL_DESCRIPTION =
  'Solve for the maximum home price you can afford under the standard 28/36 DTI rule. Inputs: monthly income, recurring monthly debts (car loans, student loans, etc.), down payment, interest rate, and optional property-tax rate / insurance / HOA / loan term. Output: max home price, the binding constraint (front-end vs back-end), and the full PITI breakdown at that price. Same math across the realty MCP cohort (@chrischall/realty-core). No network — pure local math.';

/**
 * The leaner mortgage output homes-mcp / compass-mcp / onehome-mcp
 * expose: `ltv` as a 0..1 ratio, renamed totals, no `interest_rate`
 * echo and no `total_paid_over_loan`.
 */
export interface LeanMortgageResult {
  home_price: number;
  down_payment: number;
  loan_amount: number;
  ltv: number;
  monthly_principal_interest: number;
  monthly_property_tax: number;
  monthly_insurance: number;
  monthly_hoa: number;
  monthly_pmi: number;
  monthly_total_piti: number;
  total_interest_over_term: number;
  loan_term_years: number;
}

/**
 * Project the canonical breakdown onto {@link LeanMortgageResult}. Pure;
 * the adapter homes / compass (`toCompassMortgage`) / onehome each wrote.
 */
export function toLeanMortgage(b: MortgageBreakdown): LeanMortgageResult {
  return {
    home_price: b.home_price,
    down_payment: b.down_payment,
    loan_amount: b.loan_amount,
    ltv: b.ltv_percent / 100,
    monthly_principal_interest: b.monthly_principal_interest,
    monthly_property_tax: b.monthly_property_tax,
    monthly_insurance: b.monthly_insurance,
    monthly_hoa: b.monthly_hoa,
    monthly_pmi: b.monthly_pmi,
    monthly_total_piti: b.monthly_total,
    total_interest_over_term: b.total_interest_paid,
    loan_term_years: b.loan_term_years,
  };
}

const READ_ONLY_LOCAL = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** The mortgage tool's zod input schema, built with the caller's `z`. */
export function mortgageInputSchema(z: ZodLike): unknown {
  return z.object({
    home_price: z.number().positive(),
    down_payment: z.number().nonnegative().optional(),
    down_payment_percent: z.number().nonnegative().max(100).optional(),
    interest_rate: z.number().nonnegative().describe('Annual %, e.g. 6.5'),
    loan_term_years: z.number().int().positive().optional().describe('Default 30'),
    property_tax_annual: z.number().nonnegative().optional(),
    property_tax_rate: z.number().nonnegative().optional().describe('Annual % of home price'),
    insurance_annual: z.number().nonnegative().optional(),
    hoa_monthly: z.number().nonnegative().optional(),
    pmi_rate: z.number().nonnegative().optional().describe('Annual %, applied when LTV > 80%'),
  });
}

/** The affordability tool's zod input schema, built with the caller's `z`. */
export function affordabilityInputSchema(z: ZodLike): unknown {
  return z.object({
    monthly_income: z.number().positive(),
    monthly_debts: z
      .number()
      .nonnegative()
      .optional()
      .describe('Sum of monthly debt payments (car, student loans, etc.)'),
    down_payment: z.number().nonnegative(),
    interest_rate: z.number().nonnegative().describe('Annual %, e.g. 6.5'),
    loan_term_years: z.number().int().positive().optional().describe('Default 30'),
    property_tax_rate: z
      .number()
      .nonnegative()
      .optional()
      .describe('Annual % of home price, default 1.1'),
    insurance_annual: z.number().nonnegative().optional(),
    hoa_monthly: z.number().nonnegative().optional(),
    front_end_dti: z
      .number()
      .positive()
      .max(1)
      .optional()
      .describe('Front-end DTI cap as decimal, default 0.28'),
    back_end_dti: z
      .number()
      .positive()
      .max(1)
      .optional()
      .describe('Back-end DTI cap as decimal, default 0.36'),
  });
}

/**
 * Register `<prefix>_calculate_mortgage` on `server`.
 *
 * @example registerMortgageTool(server, { z, prefix: 'compass', shape: 'lean' });
 */
export function registerMortgageTool(server: ToolServerLike, opts: MortgageToolOptions): void {
  const title = opts.title ?? MORTGAGE_TOOL_TITLE;
  const toResult = opts.toResult ?? jsonToolResult;
  const lean = opts.shape === 'lean';
  server.registerTool(
    opts.name ?? `${opts.prefix}_calculate_mortgage`,
    {
      title,
      description: opts.description ?? MORTGAGE_TOOL_DESCRIPTION,
      annotations: { title, ...READ_ONLY_LOCAL },
      inputSchema: mortgageInputSchema(opts.z),
    },
    (input: MortgageInput) => {
      const breakdown = calculateMortgage(input);
      return toResult(lean ? toLeanMortgage(breakdown) : breakdown);
    }
  );
}

/**
 * Register `<prefix>_calculate_affordability` on `server`.
 *
 * @example registerAffordabilityTool(server, { z, prefix: 'redfin' });
 */
export function registerAffordabilityTool(
  server: ToolServerLike,
  opts: CalculatorToolOptions
): void {
  const title = opts.title ?? AFFORDABILITY_TOOL_TITLE;
  const toResult = opts.toResult ?? jsonToolResult;
  server.registerTool(
    opts.name ?? `${opts.prefix}_calculate_affordability`,
    {
      title,
      description: opts.description ?? AFFORDABILITY_TOOL_DESCRIPTION,
      annotations: { title, ...READ_ONLY_LOCAL },
      inputSchema: affordabilityInputSchema(opts.z),
    },
    (input: AffordabilityInput) => toResult(calculateAffordability(input))
  );
}
