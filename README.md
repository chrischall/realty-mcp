# realty-mcp

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
| `@chrischall/realty-core` | 0.1.x — address matching, suffix variants, locality alias map, free-text address parsing, shared `ResolverVia` / `ResolvedAddress` types. |
| `@chrischall/realty-meta` (planned) | Cross-source umbrella MCP. Depends on the five Pattern A packages. Not yet scaffolded. See `CANDIDATE_LOGIC.md`. |

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
