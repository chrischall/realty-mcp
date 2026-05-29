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
- `cleanTaxAnnual` (round-4 candidate **K**) — nulls out the
  not-yet-assessed `tax_annual` placeholder that portals surface on
  new-construction listings. Reconciled from redfin `cleanTaxAnnual`
  (`=== 0 || === 1`), compass `sanitizeTaxAnnual` (`<= 1`), homes
  `isTaxSentinel` (`< 10`), plus zillow + onehome inline (`<= 1`).
  Canonical adopts homes's production-calibrated `< 10` threshold (the
  only one tuned against real 0–9 new-build placeholders, homes-mcp#17)
  and redfin's richer `{ tax_annual, tax_status }` return shape. A
  missing / non-finite input is treated as ABSENT (not a sentinel).
- `buildHyperlinkFormula` (round-4 candidate **L**, was §8 below) —
  the `=HYPERLINK("<url>","<label>")` builder for the
  `portal_url_hyperlink` field. **Fixes a latent bug:** redfin + homes
  doubled an embedded `"` (Sheets escapes a quote inside a string
  literal by doubling it), but zillow, compass, and onehome did NOT —
  an embedded quote terminated the formula's string literal early and
  produced a `#ERROR!` cell. The canonical helper escapes BOTH url and
  label, fixing the bug cohort-wide. Empty url → empty string.
- `hoaToMonthlyUsd` (cohort candidate **A**, was §A below) — normalizes
  an HOA fee to monthly USD via the per-frequency divisor table
  (`Monthly` / `Annually` / `Quarterly` / `SemiAnnually` / `Weekly`).
  Canonical accepts the UNION of input vocabularies: the MLS enum labels
  AND the looser DOM-scraped strings (`"$250 / month"`, `"per year"`,
  `"bi-annual"`), adopting homes-mcp's regex-tolerant matcher (the most
  defensive variant — it strictly dominates the bare `switch`). Null-safe:
  missing / zero / non-finite amount, missing frequency, or unparseable
  frequency → `null` (the last with a stderr warning); result rounded to
  the nearest dollar.
- `daysSince` (cohort candidate **B**, was §B below) — whole days elapsed
  since a timestamp, `floor((now - at) / 86_400_000)`. Canonical takes the
  UNION input `string | number` (ISO/`Date.parse`-able string OR unix-ms),
  covering the onehome/homes (string) and compass `daysSinceMs` (unix-ms)
  variants. The `now` reference is an INJECTABLE second arg that defaults
  to `Date.now()` so the function stays pure and tests can pin a fixed
  clock — `Date.now()` is never called unconditionally inside. Matches
  cohort behavior: returns the raw floor (same-day → `0`, future →
  negative, no clamp); `null` only for missing / unparseable / non-finite
  input.
- `priceDrop` (cohort candidate **C**, was §C below) — `amount = previous
  - current`, `percent = round((amount / previous) * 1000) / 10`.
  Canonical key names are the shorter `{ amount, percent }` (homes-mcp's
  shape) over redfin's `{ price_drop_amount, price_drop_percent }`.
  Returns a single `null` when there is no real drop (`current >=
  previous`, either input missing / non-finite, or `previous <= 0`) so
  callers get a one-truthiness "is there a drop?" check.
- `extractFeatures` + `ExtractedFeatures` (candidate J) — hoisted from
  the full `src/features.ts` module duplicated byte-for-byte across all
  5 cohort MCPs. Pure keyword extraction (lake_front, hot_tub, basement
  state, furnished, dock, community) over a description string plus a
  caller-supplied community vocabulary (`string[]`). onehome-mcp's
  basement detector is canonical: its `BASEMENT_CONNECTOR` conjunct
  class `(?:is|was|are|were|—|–|,|;|:|()` replaces the looser
  `[^.!?]{0,30}?` window the others use, so "basement with finished oak
  shelving" no longer false-positives to `finished`. `loadCommunities`
  (the env-var-driven JSON file read) stays per-consumer — it does
  filesystem I/O, so hoisting it would add a `node:fs` dep and break
  the no-I/O invariant. It just produces the `communities` argument.
  **0.3.2:** the marina dock detector's negative-lookahead place-name
  guard was hoisted from redfin-mcp into canonical (strictly more
  precise than the cohort's naked `/\bmarina\b/i`); it rejects address
  suffixes ("Marina Bay", "Marina del Rey", "123 Marina Dr") while real
  water-access prose still matches.
- `normalizeAddressForCompare` + `collectAddressAlternates` (candidate
  **D**) — strict normalize-then-dedup pair surfacing cross-MLS address
  variants as `address_alternates`. Reconciled from the byte-identical
  redfin / zillow / onehome copies (compass's `normalizeAddressForMatch`
  is the same normalisation under another name). The cohort copies
  differed only in how they gathered candidates from raw fields, so the
  canonical form takes the candidate list as an argument; each portal
  becomes a thin gather-then-call wrapper. Kept DISTINCT from the fuzzy
  `tokenize` / `addressMatch` scorers.
- `NormalizedEventType` + `mapEventType` (candidate **E**) — the shared
  price-history event taxonomy + case-insensitive substring mapper.
  Canonical type is the UNION of all four cohort synonym sets (zillow,
  redfin, compass's richest coming-soon/active/off-market/expired set,
  homes) plus the `Unknown` sentinel (redfin) so unrecognised input
  never silently mis-buckets as `Listed`. Specificity-ordered matching
  (Relisted before Listed, Pending/Contingent before Sold). **0.3.2:**
  the `completed`→Sold synonym was hoisted from compass's old inline
  ("Sale Completed" / "Transaction Completed"); a bare `temporar`→Delisted
  synonym was evaluated and skipped ("Temporarily Off Market" already
  maps via the existing `off market` substring).
- `lastSold` (candidate **P**) — most-recent `Sold` event from a
  price-history series. Reconciled from zillow's `findLastSold`
  (`event`/`date`/`time`) and redfin's `lastSold`
  (`eventDescription`/`eventDate`). **Leverages E:** sold events are
  identified by `mapEventType(get.type(e)) === 'Sold'` (so "Sold (Public
  Records)" / "Closed" all count). Generic over the event shape via
  small `{ date, price, type }` accessors instead of hard-coupling to
  one portal — so **it ships now over raw events without needing the
  separate `PriceHistoryEvent` shape** (candidate #3). The returned
  `date` is echoed in the accessor's own form (epoch number or ISO
  string); returns `null` when no sold event has a usable date.
- `urlToPath` (cohort candidate **F**) — reduces a portal URL (or bare
  path) to its `pathname + search`. The ~4-line body was byte-identical
  in `src/url.ts` across zillow / redfin / compass / homes (onehome uses
  a different id scheme and is excluded); hoisted as the canonical
  version. Absolute URL → path (host discarded), leading-slash path →
  unchanged, bare segment → leading-slash coerced, malformed → graceful
  path coercion (never throws). Pure.
- `locationToSlug` (cohort candidate **G**) — free-text location → URL
  slug (NFKD normalize, strip diacritics, lowercase, collapse runs of
  non-alphanumerics to a single `-`, trim leading/trailing `-`). Hoisted
  verbatim from the byte-identical compass + homes copies. `"Lake Lure,
  NC"` → `"lake-lure-nc"`; a bare ZIP passes through unchanged. Pure.
- `FIRST_DIGIT_TO_STATES` + `zipPlausibleStates` + `homesMatchZipState`
  + `extractZipFromLocation` (cohort candidate **H**) — light geographic
  sanity-checks for ZIP-keyed searches. The `FIRST_DIGIT_TO_STATES`
  table maps a ZIP's first digit → plausible US states;
  `zipPlausibleStates(zip)` returns them (`null` for non-US/unparseable
  input, ZIP+4 tolerated); `homesMatchZipState(zip, homeStates)` returns
  `false` ONLY when confident a returned listing's state is implausible
  for the queried ZIP (catches the cross-continent search-fallback bug —
  ZIP 28746 returning Seattle homes), `true` otherwise (incl. when it
  can't make a determination); `extractZipFromLocation(location)` pulls a
  standalone 5-digit ZIP from free text. Hoisted from `redfin-mcp/src/
  geo.ts` — 1 consumer today but portable to all search-capable MCPs, so
  shipped canonical now. Pure (static table + string ops).
- `estimateRentVsBuy` + `RentVsBuyInput` / `RentVsBuyResult` /
  `RentVsBuyYear` / `RentVsBuyInputsUsed` (candidate **I**) — the
  trickiest hoist: two MCPs implement the SAME financial model but with
  DIVERGENT output shapes, so the canonical shape is a designed superset
  rather than a copy. Reconciled from zillow's richer `computeRentVsBuy`
  (per-year `equity_if_sold_now` / `remaining_mortgage` / `home_value`
  detail) and homes's simpler `estimateRentVsBuy` (parallel
  `cumulative_buy_cost[]` / `cumulative_rent_cost[]` arrays + a headline
  `break_even_year`). **Canonical shape unifies zillow's per-year detail
  + homes's cumulative/break-even** into ONE per-year row type — `years:
  Array<{ year, home_value, remaining_mortgage, equity_if_sold_now,
  cumulative_buy_cost, cumulative_rent_cost }>` — plus a top-level
  `break_even_year: number | null` and an `inputs` echo with every rate
  assumption resolved to its default. Each consumer's existing output is
  a projection of this shape: zillow's `yearly[]` is the equity columns
  of `years[]`; homes's arrays are `years.map(y => y.cumulative_buy_cost
  / y.cumulative_rent_cost)` and its `break_even_year` is the top-level
  field. Shared default rates: appreciation 3%, rent growth 3%,
  investment return 6%, maintenance 1%, property tax 1.1%, closing 2.5%,
  selling 6%, loan term 30y; canonical default horizon 10 years. The
  per-year `cumulative_buy_cost` is NET of equity-if-sold (zillow's
  `buy_net_if_sold`) and `cumulative_rent_cost` is net of the renter's
  invested-capital gain (zillow's `rent_net`), so break-even is the first
  year buy ≤ rent on a meaningful net basis every year — replacing
  homes's weaker gross-outflow array comparison. Pure / dependency-free,
  with the same validation discipline as `calculateMortgage` /
  `calculateAffordability`.

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

### 8. URL hyperlink formula for Sheets paste — ✅ **SHIPPED** (candidate L)

Every MCP's `FormattedProperty` includes a `portal_url_hyperlink`
field — a `=HYPERLINK(...)` formula. Each MCP builds it the same way
(`buildHyperlinkFormula(url, portalLabel)`).

**Shipped** as `buildHyperlinkFormula(url, label)` in `realty-core`
0.2.x — see the "Already in `realty-core` 0.2.x" list above. The
consolidation also fixed a latent missing-quote-escaping bug that was
present in zillow / compass / onehome (they did not double an embedded
`"`, producing `#ERROR!` cells); the canonical helper escapes both url
and label.

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

### A. `hoaToMonthlyUsd` — ✅ **SHIPPED** in `realty-core` 0.2.x

_Shipped — see the "Already in `realty-core` 0.2.x" list above._

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

### B. `daysSince` — ✅ **SHIPPED** in `realty-core` 0.2.x

_Shipped — see the "Already in `realty-core` 0.2.x" list above._

`floor((Date.now() - parse(at)) / 86_400_000)` implemented in 3 of 5, with a variant in a 4th:

- `onehome-mcp/src/format.ts:248` — takes ISO string
- `homes-mcp/src/format.ts:63` — takes ISO string (near-identical to onehome)
- `zillow-mcp/src/tools/properties.ts:519` — inlined (no extracted fn)
- `compass-mcp/src/tools/properties.ts:533` — `daysSinceMs(ms)` — same logic, unix-ms input

Redfin uses portal's own `daysOnZillow`-style field and falls back to
the same expression only when absent. A union-typed
`daysSince(at: string | number | undefined): number | null` in
`realty-core` covers all variants. Pair with `hoaToMonthlyUsd`.

### C. `priceDrop` — ✅ **SHIPPED** in `realty-core` 0.2.x (was blocker for BaseProperty)

_Shipped — see the "Already in `realty-core` 0.2.x" list above._

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

### D. `collectAddressAlternates` + `normalizeAddressForCompare` — ✅ **SHIPPED** (`realty-core` 0.2.x)

Shipped — see the "Already in `realty-core` 0.2.x" list above.

Three MCPs define this pair nearly identically, with a fourth under a different name:

- `redfin-mcp/src/derived.ts:112,123`
- `zillow-mcp/src/tools/properties.ts:399,411` — byte-for-byte the same
- `onehome-mcp/src/format.ts:261,273` — same internals, different outer signature
- `compass-mcp/src/tools/by-address.ts:98` — `normalizeAddressForMatch` is the same logic under another name

`address_alternates` is one of the 14 shared `BaseProperty` fields,
so the math needs to ship in `realty-core` alongside the shape work.

### E. `NormalizedEventType` enum + `mapEventType` — ✅ **SHIPPED** (`realty-core` 0.2.x)

Shipped — see the "Already in `realty-core` 0.2.x" list above.

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
`PriceHistoryEvent` shape (existing candidate #3).

### F. `urlToPath` — ✅ **SHIPPED** in `realty-core` 0.2.x

_Shipped — see the "Already in `realty-core` 0.2.x" list above._

Identical 4-line implementation in `src/url.ts` across 4 of 5 MCPs
(all except onehome). Hoisted verbatim as `urlToPath` alongside `G`
and `H` rather than waiting on the `BaseProperty` HTTP-utilities
sub-module — the portal-specific neighbours (`extractPidFromUrl`,
`buildPropertyUrl`) stay per-consumer.

### G. `locationToSlug` — ✅ **SHIPPED** in `realty-core` 0.2.x

_Shipped — see the "Already in `realty-core` 0.2.x" list above._

Byte-for-byte identical in `compass-mcp/src/url.ts:65` and
`homes-mcp/src/url.ts:39` (NFKD + strip diacritics + lowercase +
collapse non-alnum to `-`). Hoisted verbatim alongside `urlToPath`.

### H. `zipPlausibleStates` + `homesMatchZipState` — ✅ **SHIPPED** in `realty-core` 0.2.x

_Shipped — see the "Already in `realty-core` 0.2.x" list above._

Present in `redfin-mcp/src/geo.ts:21-82` only today: a
`FIRST_DIGIT_TO_STATES` table + plausibility check that catches
search-engine region-resolution bugs (ZIP 28746 returning Seattle
homes). Portal-agnostic — shipped canonical now (1 consumer today)
because it's portable to every search-capable cohort MCP.

### I. `estimateRentVsBuy` — ✅ **SHIPPED** in `realty-core` 0.2.x

_Shipped — see the "Already in `realty-core` 0.2.x" list above._

Two MCPs ship a rent-vs-buy tool with DIVERGENT output shapes:

- `zillow-mcp/src/tools/affordability.ts:130-277` — `computeRentVsBuy` with per-year equity/remaining-mortgage detail
- `homes-mcp/src/tools/rent-vs-buy.ts:99-178` — `estimateRentVsBuy` with parallel cumulative-cost arrays + break-even

Same financial model and default rates (appreciation 3%, rent
growth 3%, investment return 6%, maintenance 1%, closing 2.5%,
selling 6%, tax 1.1%, term 30y, horizon — canonicalized to 10).
The shape-alignment decision: the canonical `RentVsBuyResult`
**unifies zillow's per-year detail with homes's cumulative /
break-even** into a single `years[]` row type
(`{ year, home_value, remaining_mortgage, equity_if_sold_now,
cumulative_buy_cost, cumulative_rent_cost }`) plus a top-level
`break_even_year` and an `inputs` echo. Each consumer's existing
output is a clean projection of this shape (zillow reads the equity
columns; homes reads `years.map(y => y.cumulative_buy_cost)` +
`break_even_year`). Break-even uses zillow's net-of-equity rule
(`buy_net_if_sold` vs `rent_net`) evaluated on EVERY year — a
strictly more meaningful definition than homes's gross-cost array
comparison.

### Summary

| | Candidate | MCPs | Score | Timeline |
|---|---|---|---|---|
| A | `hoaToMonthlyUsd` | 4-5 of 5 | HIGH | ✅ shipped 0.2.x |
| B | `daysSince` | 3 of 5 + 1 variant | HIGH | ✅ shipped 0.2.x |
| C | `priceDrop` | 5 of 5 | HIGH | ✅ shipped 0.2.x (was blocker for BaseProperty) |
| D | `collectAddressAlternates` | 3 of 5 + 1 variant | HIGH | ✅ shipped 0.2.x |
| E | `NormalizedEventType` + `mapEventType` | 4 of 5 | HIGH | ✅ shipped 0.2.x |
| F | `urlToPath` | 4 of 5 | MEDIUM | ✅ shipped 0.2.x |
| G | `locationToSlug` | 2 of 5 | MEDIUM | ✅ shipped 0.2.x |
| H | `zipPlausibleStates` | 1 today, applicable to 5 | MEDIUM | ✅ shipped 0.2.x |
| I | `estimateRentVsBuy` | 2 of 5 (divergent shapes) | MEDIUM | ✅ shipped 0.2.x (canonical shape unifies zillow per-year detail + homes cumulative/break-even) |
| J | `extractFeatures` + `ExtractedFeatures` | 5 of 5 (byte-identical) | HIGH | **shipped 0.x** (`loadCommunities` stays per-consumer — fs I/O) |
| P | `lastSold` (leverages E) | 2 of 5 | HIGH | ✅ shipped 0.2.x (no PriceHistoryEvent needed) |
