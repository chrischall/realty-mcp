/**
 * Shared resolver types — the union of every `via` value any cohort
 * MCP currently emits when resolving an address to a portal-side
 * canonical URL + id.
 *
 * | Value              | Where it's used                                          |
 * | ------------------ | -------------------------------------------------------- |
 * | `direct`           | Initial resolver hit (compass, zillow, redfin)           |
 * | `suffix_expansion` | Rd↔Road / Ln↔Lane retry (zillow, redfin)                 |
 * | `locality_remap`   | Lake Lure↔Rutherfordton retry (zillow planned)           |
 * | `search_fallback`  | City/state search bounded by price band (zillow)         |
 * | `autocomplete`     | Autocomplete-endpoint hit (redfin)                       |
 * | `slug`             | Slug-built path that resolved 200 (homes)                |
 * | `freetext`         | Free-text search hit (homes, onehome)                    |
 * | `suggestions`      | ListingSuggestionsSearch GraphQL (onehome)               |
 */
export type ResolverVia =
  | 'direct'
  | 'suffix_expansion'
  | 'locality_remap'
  | 'search_fallback'
  | 'autocomplete'
  | 'slug'
  | 'freetext'
  | 'suggestions';

/**
 * The successful branch of a per-source address resolution.
 */
export interface ResolvedAddressOk {
  resolved: true;
  /** Canonical portal-side URL for the listing or property record. */
  url: string;
  /** Portal-side identifier (zpid, home_id, listing_id, property_hash, …). */
  id: string;
  /** How the resolution was achieved — see `ResolverVia`. */
  via: ResolverVia;
  /**
   * The address the portal returned — callers should sanity-check
   * this against their input, since MLS feeds occasionally disagree.
   */
  address?: string;
}

/**
 * The unsuccessful branch — every cohort MCP degrades to this shape
 * instead of throwing so an umbrella caller can fan out across all
 * five portals in parallel and treat per-portal misses as partial.
 */
export interface ResolvedAddressErr {
  resolved: false;
  error: string;
}

/**
 * Discriminated union — narrow on the `resolved` flag.
 */
export type ResolvedAddress = ResolvedAddressOk | ResolvedAddressErr;
