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

export type {
  ResolverVia,
  ResolvedAddress,
  ResolvedAddressOk,
  ResolvedAddressErr,
} from './types.js';
