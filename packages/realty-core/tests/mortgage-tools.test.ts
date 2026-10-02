import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import { createTestHarness, parseToolResult, type TestHarness } from '@chrischall/mcp-utils/test';
import {
  registerMortgageTool,
  registerAffordabilityTool,
  toLeanMortgage,
  MORTGAGE_TOOL_DESCRIPTION,
  AFFORDABILITY_TOOL_DESCRIPTION,
} from '../src/mortgage-tools.js';
import { calculateMortgage } from '../src/mortgage.js';
import { calculateAffordability } from '../src/affordability.js';

/**
 * Drives the registrars through a REAL `McpServer` + client pair (the
 * mcp-utils test harness), so these pin what a consumer actually ships:
 * the advertised tool name/annotations, zod validation at the RPC
 * boundary, and the JSON body. realty-core itself never imports zod or
 * the SDK — the consumer hands its own `z` in.
 */

let h: TestHarness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

const base = { home_price: 400_000, interest_rate: 6.5 };

describe('registerMortgageTool', () => {
  it('registers <prefix>_calculate_mortgage as a read-only, closed-world tool', async () => {
    h = await createTestHarness((server) =>
      registerMortgageTool(server, { z, prefix: 'redfin' })
    );
    const tools = await h.client.listTools();
    expect(tools.tools).toHaveLength(1);
    const t = tools.tools[0]!;
    expect(t.name).toBe('redfin_calculate_mortgage');
    expect(t.description).toBe(MORTGAGE_TOOL_DESCRIPTION);
    expect(t.annotations).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });
    const props = (t.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props).sort()).toEqual(
      [
        'down_payment',
        'down_payment_percent',
        'hoa_monthly',
        'home_price',
        'insurance_annual',
        'interest_rate',
        'loan_term_years',
        'pmi_rate',
        'property_tax_annual',
        'property_tax_rate',
      ].sort()
    );
    expect((t.inputSchema as { required?: string[] }).required?.sort()).toEqual([
      'home_price',
      'interest_rate',
    ]);
  });

  it('canonical shape (default) returns realty-core MortgageBreakdown verbatim', async () => {
    h = await createTestHarness((server) =>
      registerMortgageTool(server, { z, prefix: 'redfin' })
    );
    const res = await h.callTool('redfin_calculate_mortgage', base);
    expect(res.isError).toBeFalsy();
    expect(parseToolResult(res)).toEqual(calculateMortgage(base));
  });

  it('lean shape projects ltv to a 0..1 ratio and renames the totals (homes/compass/onehome contract)', async () => {
    h = await createTestHarness((server) =>
      registerMortgageTool(server, { z, prefix: 'homes', shape: 'lean' })
    );
    const res = await h.callTool('homes_calculate_mortgage', {
      ...base,
      down_payment_percent: 10,
      pmi_rate: 0.5,
    });
    const body = parseToolResult<Record<string, unknown>>(res);
    const m = calculateMortgage({ ...base, down_payment_percent: 10, pmi_rate: 0.5 });
    expect(body).toEqual({
      home_price: m.home_price,
      down_payment: m.down_payment,
      loan_amount: m.loan_amount,
      ltv: 0.9,
      monthly_principal_interest: m.monthly_principal_interest,
      monthly_property_tax: m.monthly_property_tax,
      monthly_insurance: m.monthly_insurance,
      monthly_hoa: m.monthly_hoa,
      monthly_pmi: m.monthly_pmi,
      monthly_total_piti: m.monthly_total,
      total_interest_over_term: m.total_interest_paid,
      loan_term_years: m.loan_term_years,
    });
    expect(body).not.toHaveProperty('interest_rate');
    expect(body).not.toHaveProperty('total_paid_over_loan');
  });

  it.each([
    ['home_price 0', { home_price: 0, interest_rate: 6 }],
    ['negative rate', { home_price: 1, interest_rate: -1 }],
    ['loan_term_years 0 (#661)', { ...base, loan_term_years: 0 }],
    ['fractional loan term', { ...base, loan_term_years: 29.5 }],
    ['down_payment_percent > 100', { ...base, down_payment_percent: 101 }],
    ['negative down_payment', { ...base, down_payment: -5 }],
    ['missing interest_rate', { home_price: 400_000 }],
  ])('rejects %s at the schema boundary', async (_label, args) => {
    h = await createTestHarness((server) =>
      registerMortgageTool(server, { z, prefix: 'zillow' })
    );
    const res = await h.callTool('zillow_calculate_mortgage', args);
    expect(res.isError).toBe(true);
  });

  it('honours title / description / name overrides', async () => {
    h = await createTestHarness((server) =>
      registerMortgageTool(server, {
        z,
        prefix: 'x',
        name: 'custom_mortgage',
        title: 'T',
        description: 'D',
      })
    );
    const t = (await h.client.listTools()).tools[0]!;
    expect(t.name).toBe('custom_mortgage');
    expect(t.title).toBe('T');
    expect(t.description).toBe('D');
  });
});

describe('toLeanMortgage', () => {
  it('maps ltv_percent → ltv ratio and drops the zillow-only fields', () => {
    const m = calculateMortgage({ home_price: 500_000, interest_rate: 7, down_payment: 100_000 });
    const lean = toLeanMortgage(m);
    expect(lean.ltv).toBeCloseTo(0.8, 10);
    expect(lean.monthly_total_piti).toBe(m.monthly_total);
    expect(lean.total_interest_over_term).toBe(m.total_interest_paid);
    expect(Object.keys(lean)).toHaveLength(12);
  });
});

describe('registerAffordabilityTool', () => {
  const input = { monthly_income: 12_000, down_payment: 80_000, interest_rate: 6.5 };

  it('registers <prefix>_calculate_affordability and returns calculateAffordability verbatim', async () => {
    h = await createTestHarness((server) =>
      registerAffordabilityTool(server, { z, prefix: 'onehome' })
    );
    const t = (await h.client.listTools()).tools[0]!;
    expect(t.name).toBe('onehome_calculate_affordability');
    expect(t.description).toBe(AFFORDABILITY_TOOL_DESCRIPTION);
    expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    const res = await h.callTool('onehome_calculate_affordability', input);
    expect(parseToolResult(res)).toEqual(calculateAffordability(input));
  });

  it.each([
    // The strict (zillow/redfin) DTI bound: a 0 cap is nonsense — it
    // makes every price unaffordable. homes/compass/onehome allowed it.
    ['front_end_dti 0', { ...input, front_end_dti: 0 }],
    ['back_end_dti 0', { ...input, back_end_dti: 0 }],
    ['front_end_dti > 1', { ...input, front_end_dti: 1.01 }],
    ['monthly_income 0', { ...input, monthly_income: 0 }],
    ['negative debts', { ...input, monthly_debts: -1 }],
    ['loan_term_years 0', { ...input, loan_term_years: 0 }],
  ])('rejects %s at the schema boundary', async (_label, args) => {
    h = await createTestHarness((server) =>
      registerAffordabilityTool(server, { z, prefix: 'homes' })
    );
    const res = await h.callTool('homes_calculate_affordability', args);
    expect(res.isError).toBe(true);
  });

  it('accepts a DTI cap of exactly 1', async () => {
    h = await createTestHarness((server) =>
      registerAffordabilityTool(server, { z, prefix: 'homes' })
    );
    const res = await h.callTool('homes_calculate_affordability', {
      ...input,
      front_end_dti: 1,
      back_end_dti: 1,
    });
    expect(res.isError).toBeFalsy();
  });
});
