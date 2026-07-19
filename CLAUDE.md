# CLAUDE.md — realty-mcp

Guidance for Claude working in this repo.

## TL;DR

This lib was bootstrapped from the round-3 realty cohort drift
problem. Each shared utility here started life duplicated 3+ times
across the 5 realty MCPs (zillow-mcp, redfin-mcp, compass-mcp,
homes-mcp, onehome-mcp). Hoisting them lets each consumer migrate to
one canonical implementation with shared tests.

Currently published: **`@chrischall/realty-core`** only (version owned
by the root — see `.release-please-manifest.json`).
`@chrischall/realty-meta` is planned, not yet scaffolded (see
`CANDIDATE_LOGIC.md` and `README.md`).

**Portal sources** (what realty-meta will orchestrate) are separate
repos that *consume* `realty-core`; they are not dependencies of this
monorepo and appear here only as references (the README "Portal sources"
table + provenance notes in `realty-core` comments). The US cohort
(zillow/redfin/compass/homes/onehome) is Pattern-A/fetchproxy and mostly
bin-only today. **hemnet-mcp** (Sweden — SEK/m²/*slutpriser*, direct
anonymous GraphQL) is the first source that already ships the ESM
library surface realty-meta needs (`createHemnetClient`, `HemnetClient`,
`format*`, `computeMarketStats`, `registerHemnetTools`) and consumes
`realty-core`'s `addressMatch`. Being a different market, it's a
parallel source, not a US cross-portal reconciliation peer.

## Workspaces

Single published package today. The src is one file per helper under
`packages/realty-core/src/`, re-exported from `index.ts`; every helper
has a sibling vitest in `packages/realty-core/tests/`.

| Package | What it does |
|---|---|
| `@chrischall/realty-core` | Pure, dependency-free helpers: address tokenisation + match scoring (`address-match`), USPS street-suffix variant expansion (`street-variants`), locality-alias remap (`locality-alias` — Lake Lure ↔ Rutherfordton, Beech / Sugar Mountain ↔ Banner Elk), free-text address parsing + alternates (`parse-address`, `address-alternates`); `calculateMortgage` (PITI), `calculateAffordability` (DTI inverse-PMT), `estimateRentVsBuy`; feature extraction (`features`); tax / HOA / days-on-market / price-drop / last-sold / lot-size (`sqftToAcres`) derivations; event-type mapping; hyperlink-formula, URL (`url-path`, `location-slug`) and geo ZIP↔state (`geo`) helpers; shared resolver types (`types`). Every export has a vitest. |

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

Both `pr-auto-review.yml` and `auto-merge.yml` are thin stubs calling
reusable workflows in `chrischall/workflows`. Auto-review emits a
structured verdict and arms `ready-to-merge` on `pass` **or** `warn`;
`auto-merge.yml` then arms `--auto --squash` on that label. `warn` and
`fail` also open/update an `auto-review-followup` issue (see below);
only `fail` blocks the merge. `ci.yml` is the last gate — for human PRs
it runs only once `ready-to-merge` is armed (bot PRs run CI on every
event). Release PRs ship via the `release-ready` label, not
`ready-to-merge`.

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

<!-- pr-workflow:v3 -->
## Pull requests & release notes

Fleet policy — Conventional-Commit PR titles, labels, the auto-review /
auto-merge ladder, auto-review follow-up issues, PR timing, and release PRs —
lives in `~/.claude/CLAUDE.md`. Don't restate it here; the copies drifted.

Shared technical conventions (publishing, bundling, versioning guards,
write-verification, transport archetypes, testing traps) live in
[`chrischall/workflows`](https://github.com/chrischall/workflows):
`docs/fleet-conventions.md`, plus `README.md` for the CI pipeline contract.

