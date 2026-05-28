# CLAUDE.md — realty-mcp

Guidance for Claude working in this repo.

## TL;DR

This lib was bootstrapped from the round-3 realty cohort drift
problem. Each shared utility here started life duplicated 3+ times
across the 5 realty MCPs (zillow-mcp, redfin-mcp, compass-mcp,
homes-mcp, onehome-mcp). The cohort migration will follow once 0.1.0
publishes — file an issue per consumer at scaffold time.

Current line: **0.1.x** — `@chrischall/realty-core` only.
`@chrischall/realty-meta` is planned (see `CANDIDATE_LOGIC.md`).

## Workspaces

| Package | What it does |
|---|---|
| `@chrischall/realty-core` | Pure, dependency-free helpers: address tokenisation + match scoring, USPS street-suffix variant expansion, locality-alias remap (Lake Lure ↔ Rutherfordton, Beech / Sugar Mountain ↔ Banner Elk), free-text address parsing, shared resolver types, `calculateAffordability` (DTI-inverse-PMT). Every export has a vitest. |

## Commands

| | |
|---|---|
| `npm test` | Vitest across all workspaces. Must stay green. |
| `npm run build` | TS build for every workspace. |
| `npm run typecheck` | `tsc -b` against `realty-core`. |
| `npm test --workspace=@chrischall/realty-core` | Run just the core package's tests. |
| `npm run release:core` | Manual publish of `@chrischall/realty-core` (rare — release-please normally owns this). Uses `publishConfig` from the package. |

## Conventions

### TDD throughout

Every utility lands with a failing test first. The library is small
and pure — there's no excuse for un-tested code. CI runs vitest on PRs.

### Versioning + releases

Mirrors fetchproxy / ofw-mcp: release-please opens a single combined
release PR (linked-versions, `extra-files` propagation); merging it
cuts one umbrella `v<x.y.z>` tag, which fires the publish job. Do not
bump sub-package versions by hand — release-please owns lockstep.

### PRs + auto-merge

`pr-auto-review.yml` runs Claude review with a structured verdict and
adds `ready-to-merge` on pass/warn. `auto-merge.yml` arms
`--auto --squash` on that label. Same flow as fetchproxy.

## Hoisting policy

A helper belongs in `realty-core` when:

1. Two or more cohort MCPs already implement it (or could share one
   implementation with no portal-specific quirks), AND
2. It's pure — no I/O, no portal SDK dependency.

A helper belongs in `realty-meta` (planned) when it ORCHESTRATES the
cohort — e.g. cross-source resolution, candidate ranking,
deduplication of records returned by multiple portals.

## What to *not* do

- Don't add a dependency to `realty-core`. It's peer-dep-free and stays
  that way — every consumer is itself a published MCP and dragging in
  transitive deps via a shared lib forces their hand.
- Don't bake portal-specific magic strings into `realty-core`. If
  Zillow has a quirk about slug format, that lives in zillow-mcp.
- Don't manually bump versions or arm `ready-to-merge` to bypass
  review. Let the auto-review verdict gate.
