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

export type {
  ResolverVia,
  ResolvedAddress,
  ResolvedAddressOk,
  ResolvedAddressErr,
} from './types.js';
