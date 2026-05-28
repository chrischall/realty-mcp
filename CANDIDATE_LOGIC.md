# CANDIDATE_LOGIC.md

Cohort survey of duplicated logic across the 5 realty MCPs
(zillow-mcp, redfin-mcp, compass-mcp, homes-mcp, onehome-mcp) —
candidates for hoisting into `@chrischall/realty-core` beyond what
0.1.0 already covers.

Each entry: **where it lives today**, **estimated reuse value** (high
/ medium / low), and a **recommended timeline**.

## Already in 0.x (`realty-core` v0.2.x)

Reconciled and shipped:

- `tokenize` + `addressMatch` — was duplicated in compass `by-address`,
  redfin `resolve`, homes `by-address`, onehome `by-address`.
- `SUFFIX_PAIRS` + `expandSuffix` — full table only existed in
  redfin's `suffix.ts`; zillow's `get-by-address.ts` had a smaller
  partial copy.
- `compoundSplits` + `buildVariants` — net-new convergence requested
  by round-3 #75 (Bluebird ↔ Blue Bird-style retries).
- `LocalityAliasMap` — net-new; round-3 #75 Lake Lure / Beech Mountain
  / Sugar Mountain cohort.
- `parseAddress` — hoisted from zillow's `address-parse.ts`; redfin,
  compass, homes, onehome all reinvent a similar regex inline.
- `ResolverVia` / `ResolvedAddress` types — union of every `via`
  string any cohort MCP currently emits.
- `calculateMortgage` + `MortgageInput` / `MortgageBreakdown` —
  hoisted from zillow's `mortgage.ts` (the most complete cohort
  reference, with redfin line-identical; compass / homes / onehome
  the leaner variant). Pure PMT math with PITI decomposition,
  > 80% LTV PMI gating, zero-interest straight-line fallback,
  and explicit validation. Output is the union shape: zillow's
  complete set plus `home_price` echo for the compass-family
  wrappers.

## Already in `realty-core` 0.2.x (in flight)

- `calculateAffordability` — hoisted from the zillow/redfin lean
  closed-form impl; the compass/homes/onehome variants compute the
  same answer via a slightly different inversion. The cohort
  `*_calculate_affordability` tools become thin wrappers (~30 lines
  each instead of ~120) over the pure core.

## Phase-2 candidates (next minor: 0.2.x)

### 1. `FormattedProperty` shape unification — **HIGH** reuse, **next minor**

All five MCPs define `interface FormattedProperty` in their
`src/tools/properties.ts`:

- zillow `properties.ts:122`
- redfin `properties.ts:234`
- compass `properties.ts:186`
- homes `properties.ts:135`
- onehome (implicit shape in `src/tools/properties.ts`)

**Field overlap is ~80%** across the cohort. The common core:

```ts
url, portal_url_hyperlink, address, address_alternates,
city, state, zip, beds, baths, year_built, price, status,
description, latitude, longitude
```

Plus portal-specific extension fields (zillow's `zestimate`,
redfin's `mls_id`, compass's `pid` / `listing_id_sha`,
homes's `matterport_url` / `floorplan_urls`, onehome's
`offered_by` / `co_listing_agent`).

**Recommended:** hoist a `BaseProperty` interface with the 14 shared
fields plus an opaque `portal_extras: Record<string, unknown>` for
per-portal extension. The cohort `FormattedProperty` types become
`BaseProperty & { ... }` intersections. Migration is purely additive
— no runtime behaviour change.

**Why now:** the upcoming `realty-meta` package (#10) needs ONE shape
to merge into. Without this, the umbrella tool's return type ends up
as a discriminated union of five drifting record shapes.

### 2. Mortgage + affordability math — _both shipped in `realty-core` 0.2.x. See "Already in" above._

### 3. Price-history shape — **HIGH** reuse, **next minor**

4 of 5 MCPs (all except onehome) have `get_price_history` and
emit a list of `{ date, event, price, … }` records. Field names
differ slightly:

- zillow: `{ date, price, event, source, attribute_source }`
- redfin: `{ date, event, price, sqft_price_per }`
- compass: `{ date, event, price }`
- homes: `{ event_date, event, price, source }`

**Recommended:** ship `PriceHistoryEvent` type + a
`normalizePriceHistory(raw, portal): PriceHistoryEvent[]` adapter.
Lower urgency than the mortgage/affordability hoist because the
shape is already mostly stable.

## Phase-3 candidates (depends on real demand: 0.3.x+)

### 4. Healthcheck base class — **MEDIUM** reuse

Every MCP has a `*_healthcheck` tool. zillow / redfin / compass /
homes are all ~179 lines, onehome is 198 lines. The shape is:

```ts
{ status: 'ok' | 'degraded' | 'down', checks: { name, ok, latency_ms }[] }
```

The checks themselves are portal-specific (zillow probes
`getMarketStat`, redfin probes autocomplete, etc.), so the
hoist is purely the result shape + a tiny runner harness.

**Recommended:** ship `Healthcheck` base class + `HealthcheckResult`
type when a SECOND consumer (probably the meta-MCP) needs to fan out
healthchecks across the cohort. Until then, the inline copies are
fine.

### 5. Climate / school / walk-score — **LOW** reuse (today)

Only present on a subset:

- redfin: `src/tools/climate.ts` (the only climate-risk surface)
- onehome: `src/tools/schools.ts` (the only school-detail surface
  outside zillow's inline `schools` field on `FormattedProperty`)
- (no cohort MCP has a generic walk score endpoint as of round-3)

**Recommended:** **do not hoist yet.** Single-consumer logic stays in
the consumer. Revisit when at least one other MCP wires up climate
risk or schools.

### 6. JSON-LD `RealEstateListing` parser — **MEDIUM** reuse

homes-mcp and compass-mcp both parse `Schema.org` JSON-LD nodes from
SSR'd HTML. homes uses `extractJsonLd` + `findGraphNode`; compass
inlines similar logic in `src/tools/by-address.ts`.

**Recommended:** if a third MCP (likely redfin's planned static-HTML
fallback path) adopts JSON-LD parsing, hoist `extractJsonLd` +
`findGraphNode` then. Two consumers is borderline; three is the
threshold.

### 7. `extractMlsSuffix` + `~MLS` routing — **LOW** reuse (today)

onehome has session-routing keyed by listing-id `~MLS` suffix
(`src/client.ts:72-86`). No other cohort MCP uses this convention —
it's a OneHome quirk because OneHome is the multi-MLS aggregator.

**Recommended:** **don't hoist.** Keep as portal-specific.

### 8. URL hyperlink formula for Sheets paste — **MEDIUM** reuse

Every MCP's `FormattedProperty` includes a `portal_url_hyperlink`
field — a `=HYPERLINK(...)` formula. Each MCP builds it the same way
(`buildHyperlinkFormula(url, portalLabel)`).

**Recommended:** hoist alongside the `BaseProperty` work in #1 — it's
a one-liner that benefits from a single canonical implementation
(matches the cohort convention of escape-quoting the URL and label).

## `realty-meta` package outline (0.x → 1.0 path)

The eventual umbrella MCP — round-3 #10 / #11. Lives in
`packages/realty-meta` (not yet scaffolded).

**Surface (tentative):**

```ts
realty_get_by_address({ address, city, state, zip })
  → fan out to all 5 portals in parallel
  → return per-portal { resolved, url, id, via } results
  → flag cross-portal mismatch (different street_address back)

realty_resolve_addresses({ addresses: string[], price_floor?, price_ceiling? })
  → batched form, same fan-out
  → returns per-portal id arrays + a merged canonical id table

last_sold_candidates({ city, state, since, until })
  → meta-search across portals with cohort price-band gating
  → de-duplicate by address fuzzy-match (uses realty-core's
    addressMatch above the threshold)
```

**Dependencies (planned):**

```jsonc
{
  "dependencies": {
    "@chrischall/realty-core":  "^0.1.0",
    // The 5 portal MCPs published as libraries (not just bins):
    "@chrischall/zillow-mcp":   "^0.5.0",
    "@chrischall/redfin-mcp":   "^0.5.0",
    "@chrischall/compass-mcp":  "^0.5.0",
    "@chrischall/homes-mcp":    "^0.5.0",
    "@chrischall/onehome-mcp":  "^0.5.0"
  }
}
```

Blocker: not every cohort MCP currently exports its tool functions
as a library — most ship only as MCP-server binaries. The meta-MCP
hoist needs each cohort package to expose its core `*Client` +
typed helpers as ESM exports, or `realty-meta` will have to shell
out to each MCP over stdio (workable but ugly).

**Recommended:** wait until 0.1.0 publishes and the cohort migration
(linked tracker issue) is in flight before starting on `realty-meta`.
The migration will surface the right shape for shared exports.
