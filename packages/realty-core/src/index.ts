export { tokenize, addressMatch } from './address-match.js';
export type { AddressMatchResult } from './address-match.js';

export {
  SUFFIX_PAIRS,
  expandSuffix,
  compoundSplits,
  buildVariants,
} from './street-variants.js';

export { LocalityAliasMap } from './locality-alias.js';
export type { LocalityKey, LocalityLookup } from './locality-alias.js';

export { parseAddress } from './parse-address.js';
export type { ParsedAddress } from './parse-address.js';

export { calculateAffordability } from './affordability.js';
export type {
  AffordabilityInput,
  AffordabilityResult,
} from './affordability.js';

export { calculateMortgage } from './mortgage.js';
export { MAX_HORIZON_YEARS, MAX_LOAN_TERM_YEARS } from './calculator-bounds.js';
export type { MortgageInput, MortgageBreakdown } from './mortgage.js';

export { sqftToAcres, SQFT_PER_ACRE } from './sqft-acres.js';

export { cleanTaxAnnual, TAX_SENTINEL_THRESHOLD } from './tax.js';

export { buildHyperlinkFormula } from './hyperlink.js';

export { extractFeatures } from './features.js';
export type { ExtractedFeatures } from './features.js';

export type {
  ResolverVia,
  ResolvedAddress,
  ResolvedAddressOk,
  ResolvedAddressErr,
} from './types.js';

// --- derived numeric fields (cohort candidates A, B, C) ---
export { hoaToMonthlyUsd } from './hoa.js';
export type { HoaToMonthlyOptions } from './hoa.js';
export { daysSince } from './days-since.js';
export { priceDrop } from './price-drop.js';
export type { PriceDrop } from './price-drop.js';

// --- derived address + event helpers (cohort candidates D, E, P) ---
export {
  normalizeAddressForCompare,
  collectAddressAlternates,
} from './address-alternates.js';

export { mapEventType } from './event-type.js';
export type { NormalizedEventType } from './event-type.js';

export { lastSold } from './last-sold.js';

// --- URL / geo utilities (cohort candidates F, G, H) ---
export { urlToPath } from './url-path.js';
export { locationToSlug } from './location-slug.js';
export {
  FIRST_DIGIT_TO_STATES,
  zipPlausibleStates,
  homesMatchZipState,
  extractZipFromLocation,
} from './geo.js';

// --- region:rent-vs-buy (cohort candidate I) ---
export { estimateRentVsBuy } from './rent-vs-buy.js';
export type {
  RentVsBuyInput,
  RentVsBuyResult,
  RentVsBuyYear,
  RentVsBuyInputsUsed,
} from './rent-vs-buy.js';
// --- endregion:rent-vs-buy ---

// --- MCP tool registrars (fleet-audit#1090) — consumer injects z + server ---
export {
  registerMortgageTool,
  registerAffordabilityTool,
  toLeanMortgage,
  mortgageInputSchema,
  affordabilityInputSchema,
  MORTGAGE_TOOL_TITLE,
  MORTGAGE_TOOL_DESCRIPTION,
  AFFORDABILITY_TOOL_TITLE,
  AFFORDABILITY_TOOL_DESCRIPTION,
} from './mortgage-tools.js';
export type {
  MortgageToolShape,
  CalculatorToolOptions,
  MortgageToolOptions,
  LeanMortgageResult,
} from './mortgage-tools.js';
export { jsonToolResult } from './tool-types.js';
export type {
  ZodLike,
  ZodNumberLike,
  ZodOptionalLike,
  ToolServerLike,
  ToolAnnotationsLike,
  TextToolResult,
  ToolResultLike,
} from './tool-types.js';

// --- per-row batch plumbing + compare pivot (fleet-audit#1091) ---
export {
  runRowBatch,
  rowEnvelope,
  errorRow,
  pendingRow,
  pendingRowMessage,
  isRetryableRowKind,
  throwIfAborted,
  guardMethods,
  RowAbandonedError,
  DEFAULT_ROW_BATCH_DEADLINE_MS,
  DEFAULT_ROW_BATCH_CONCURRENCY,
  DEFAULT_RETRYABLE_ROW_KINDS,
} from './row-batch.js';
export type {
  RowBatchKit,
  RowErrorFields,
  RowOutcome,
  RowEnvelope,
  RowEnvelopeCounts,
  RunRowBatchOptions,
} from './row-batch.js';
export { pivotSummary } from './compare-summary.js';
export type { SummaryField, SummaryRow } from './compare-summary.js';

// --- view helpers + community vocabulary (fleet-audit#1175) ---
export { makeViewHelpers, compactNote, REALTY_VIEWS } from './view.js';
export type { ViewKit, ViewHelperOptions, ViewHelpers, MediaKeyMatcher } from './view.js';
export { DEFAULT_COMMUNITIES } from './communities.js';

// --- sold-price market stats (fleet-audit#1020 / #988) ---
export { computeMarketStats, median, mean, numericColumn } from './market-stats.js';
export type { MarketStats, MarketStatsFields } from './market-stats.js';
