# realty-mcp

[![CI](https://github.com/chrischall/realty-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/chrischall/realty-mcp/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Shared utilities currently duplicated across the realty cohort (zillow-mcp,
redfin-mcp, compass-mcp, homes-mcp, onehome-mcp), plus the eventual
meta-MCP for cross-source resolution (round-3 #10 / #11 — unified
`realty_get_by_address`, `realty_resolve_addresses`,
`last_sold_candidates`).

The libraries here started life as drift between five Pattern A MCPs.
Each helper has 3+ slightly-different implementations across the cohort
already; hoisting them lets each consumer migrate to one canonical
implementation with shared tests.

## Packages

| Package | Status |
|---|---|
| `@chrischall/realty-core` | Address matching, suffix variants, locality alias map, free-text address parsing + alternates; mortgage / affordability / rent-vs-buy calculators; feature extraction; tax, HOA, days-on-market, price-drop, last-sold and lot-size derivations; event-type mapping; hyperlink-formula, URL and geo (ZIP↔state) helpers; shared `ResolverVia` / `ResolvedAddress` types. |
| `@chrischall/realty-meta` (planned) | Cross-source umbrella MCP. Depends on the portal packages below. Not yet scaffolded. See `CANDIDATE_LOGIC.md`. |

## Portal sources

The MCPs `realty-meta` will orchestrate. Each is its own repo; they
consume `@chrischall/realty-core` (they are not dependencies *of* this
monorepo). The realty-meta blocker is that most ship only as
MCP-server binaries — to be composed they must also export their
`*Client` + typed helpers as an ESM library.

| Source | Market | Library surface |
|---|---|---|
| zillow-mcp, redfin-mcp, compass-mcp, homes-mcp, onehome-mcp | US (USD / sqft / ZIP) — Pattern A (fetchproxy) | bin-only today; library export pending the cohort migration |
| [hemnet-mcp](https://github.com/chrischall/hemnet-mcp) | Sweden (SEK / m² / *slutpriser*) — direct anonymous GraphQL, no auth | ✅ ships as a library (`import { createHemnetClient, registerHemnetTools, formatListingCard, computeMarketStats } from 'hemnet-mcp'`) |

hemnet-mcp is the first source that already meets the library-export
contract, and it consumes `realty-core`'s portal-agnostic
`addressMatch` for its `hemnet_get_by_address` resolution. Because it's
a different market, it participates as a parallel portal source rather
than in US cross-portal address de-duplication (a Swedish property has
no Zillow/Redfin counterpart to reconcile against).

## Commands

| | |
|---|---|
| `npm test` | Vitest across the workspace. |
| `npm run build` | TS build for every workspace with a build script. |
| `npm run typecheck` | `tsc -b` against `realty-core`. |

## Versioning + releases

Lockstep across published `@chrischall/*` packages via release-please
(`release-please-config.json` with `extra-files` propagating the
umbrella version into every sub-package). Mirrors the fetchproxy /
ofw-mcp release shape. **Do not bump versions manually.**
