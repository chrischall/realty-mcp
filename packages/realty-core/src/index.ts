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
