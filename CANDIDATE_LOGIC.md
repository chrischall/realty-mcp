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

## Additional candidates discovered via cohort scan (2026-05-28)

These were surfaced by a code-explorer pass across all five cohort
MCPs after the initial 0.1.0 scaffold and the in-flight phase-2 work.
Each entry is verified to be implemented (or trivially shareable)
across ≥ 2 cohort MCPs.

**Key observation:** candidates A–E are tightly coupled to the
existing phase-2 FormattedProperty / PriceHistoryEvent work, and in
practice form a single cohesive "derived fields" PR (or set of small
PRs) that needs to land in lockstep. `priceDrop` (C) and
`collectAddressAlternates` (D) are direct prerequisites for a clean
`BaseProperty` type — the shape can't be standardized while the
math that derives those fields is scattered across the cohort.

### A. `hoaToMonthlyUsd` — **HIGH** reuse, **phase-2**

Present in 4-5 of 5 MCPs with the same `switch` table over
`Annually | Quarterly | Monthly | SemiAnnually | Weekly`:

- `redfin-mcp/src/derived.ts:23`
- `zillow-mcp/src/tools/properties.ts:363`
- `compass-mcp/src/tools/properties.ts:463`
- `onehome-mcp/src/format.ts:213`
- `homes-mcp/src/format.ts:27` — regex-tolerant variant for DOM-scraped strings

Recommended: a single canonical `hoaToMonthlyUsd(amount, frequency)`
in `realty-core` that accepts both the MLS enum vocabulary and the
looser DOM-string forms (homes-mcp's variant is the most defensive
union).

### B. `daysSince` — **HIGH** reuse, **phase-2**

`floor((Date.now() - parse(at)) / 86_400_000)` implemented in 3 of 5:

- `onehome-mcp/src/format.ts:248` — takes ISO string
- `homes-mcp/src/format.ts:63` — takes ISO string (near-identical to onehome)
- `zillow-mcp/src/tools/properties.ts:519` — inlined (no extracted fn)
- `compass-mcp/src/tools/properties.ts:533` — `daysSinceMs(ms)` — same logic, unix-ms input

Redfin uses portal's own `daysOnZillow`-style field and falls back to
the same expression only when absent. A union-typed
`daysSince(at: string | number | undefined): number | null` in
`realty-core` covers all variants. Pair with `hoaToMonthlyUsd`.

### C. `priceDrop` — **HIGH** reuse, **phase-2** (blocker for BaseProperty)

`(previous - current)` and `round((amount / previous) * 1000) / 10`
implemented identically across 5 of 5 (inlined in 3, extracted in 2):

- `redfin-mcp/src/derived.ts:59` — `priceDrop(curr, prev)` → `{ price_drop_amount, price_drop_percent }`
- `homes-mcp/src/format.ts:77` — `computePriceDrop(prev, curr)` → `{ amount, percent }`
- `zillow-mcp/src/tools/properties.ts:524-536` — inlined
- `compass-mcp/src/tools/properties.ts:617-628` — inlined
- `onehome-mcp/src/format.ts:337-349` — inlined

The shorter `{ amount, percent }` key names are preferred. A
canonical `priceDrop(prev, curr): { amount, percent } | null` in
`realty-core` is a direct prerequisite for the `BaseProperty` shape
(candidate #1) — `price_drop_*` fields can't be declared on a shared
interface while the math is scattered.

### D. `collectAddressAlternates` + `normalizeAddressForCompare` — **HIGH** reuse, **phase-2** (blocker for BaseProperty)

Three MCPs define this pair nearly identically:

- `redfin-mcp/src/derived.ts:112,123`
- `zillow-mcp/src/tools/properties.ts:399,411` — byte-for-byte the same
- `onehome-mcp/src/format.ts:261,273` — same internals, different outer signature
- `compass-mcp/src/tools/by-address.ts:98` — `normalizeAddressForMatch` is the same logic under another name

`address_alternates` is one of the 14 shared `BaseProperty` fields,
so the math needs to ship in `realty-core` alongside the shape work.

### E. `NormalizedEventType` enum + `mapEventType` — **HIGH** reuse, **phase-2** (alongside PriceHistoryEvent)

Four MCPs independently define the same 8-member union + a
string-to-enum mapper:

- `zillow-mcp/src/tools/history-format.ts:37-45`
- `redfin-mcp/src/tools/history.ts:77-86` — adds `Unknown` sentinel
- `compass-mcp/src/tools/history.ts:62-70` — richest synonym set
- `homes-mcp/src/tools/history.ts:45-53`

All four do case-insensitive substring matching against the same
keyword set (`relist`, `sold`, `pending`, `contingent`,
`price change`, `withdrawn`, `delist`, etc.). Compass adds
`coming soon`, `active`, `off market`/`expired`. A union of all four
synonym sets ships in `realty-core` at the same time as the
`PriceHistoryEvent` shape (existing candidate #4).

### F. `urlToPath` — **MEDIUM** reuse, **phase-3**

Identical 4-line implementation in `src/url.ts` across 4 of 5 MCPs
(all except onehome). The reason to defer: each `url.ts` carries
portal-specific helpers alongside (`extractPidFromUrl` in compass,
`locationToSlug` in compass+homes, `buildPropertyUrl` in onehome).
Hoisting `urlToPath` alone leaves a one-liner stub. The right moment
is when the `BaseProperty` migration creates a `realty-core` HTTP
utilities sub-module.

### G. `locationToSlug` — **MEDIUM** reuse, **phase-3**

Byte-for-byte identical in `compass-mcp/src/url.ts:65` and
`homes-mcp/src/url.ts:39` (NFKD + strip diacritics + lowercase +
collapse non-alnum to `-`). Two consumers meets the threshold but
this is path-building rather than domain logic. Ship alongside
`urlToPath`.

### H. `zipPlausibleStates` + `homesMatchZipState` — **MEDIUM** reuse, **phase-3**

Present in `redfin-mcp/src/geo.ts:21-82` only today: a
`FIRST_DIGIT_TO_STATES` table + plausibility check that catches
search-engine region-resolution bugs (ZIP 28746 returning Seattle
homes). Portal-agnostic — every search-capable MCP could use it.
Gate on a second MCP adopting it before hoisting.

### I. `estimateRentVsBuy` — **MEDIUM** reuse, **phase-3**

Two MCPs ship a rent-vs-buy tool:

- `zillow-mcp/src/tools/affordability.ts:130-277` — `computeRentVsBuy` with per-year equity/remaining-mortgage detail
- `homes-mcp/src/tools/rent-vs-buy.ts:99-178` — `estimateRentVsBuy` with parallel cumulative-cost arrays + break-even

Same financial model and default rates (appreciation 3%, rent
growth 3%, investment return 6%, maintenance 1%, closing 2.5%,
selling 6%). Output shapes diverge enough that a unified core
requires choosing one shape and migrating the other MCP. Phase-3,
gated on the shape-alignment decision.

### Summary

| | Candidate | MCPs | Score | Timeline |
|---|---|---|---|---|
| A | `hoaToMonthlyUsd` | 4-5 of 5 | HIGH | phase-2 |
| B | `daysSince` | 3 of 5 + 1 variant | HIGH | phase-2 |
| C | `priceDrop` | 5 of 5 | HIGH | phase-2 (blocker for BaseProperty) |
| D | `collectAddressAlternates` | 3 of 5 + 1 variant | HIGH | phase-2 (blocker for BaseProperty) |
| E | `NormalizedEventType` + `mapEventType` | 4 of 5 | HIGH | phase-2 (alongside PriceHistoryEvent) |
| F | `urlToPath` | 4 of 5 | MEDIUM | phase-3 |
| G | `locationToSlug` | 2 of 5 | MEDIUM | phase-3 |
| H | `zipPlausibleStates` | 1 today, applicable to 5 | MEDIUM | phase-3 |
| I | `estimateRentVsBuy` | 2 of 5 | MEDIUM | phase-3 |
