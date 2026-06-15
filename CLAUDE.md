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

<!-- pr-workflow:v2 -->
## Pull requests & releases

**Default workflow: branch + PR.** This repo **squash-merges**, so the **PR title MUST be a Conventional Commit** (`fix(scope): …`, `feat(scope): …`) — it becomes the squash commit's subject line, the only thing release-please (`.github/workflows/release-please.yml`) parses to pick the version bump and changelog section. Only `feat` (minor), `fix` (patch), and `!`/`BREAKING CHANGE` (major) cut a release; `perf`/`refactor`/`docs` show in the changelog without bumping; `ci`/`test`/`build`/`chore` are recognised but hidden (`release-please-config.json` → `changelog-sections`). A title without a conventional type is invisible to release-please.

**Don't run `gh pr merge` yourself.** `pr-auto-review.yml` reviews every PR and adds `ready-to-merge` on a `pass` **or** `warn` verdict; `auto-merge.yml` then arms `gh pr merge --auto --squash`. `warn`/`fail` also open a follow-up issue (see below) and only `fail` blocks. Override a `fail` only by adding the label yourself. Open a PR only when the change is done — it auto-merges on a passing review.

### Auto-review follow-up issues

When a PR's auto-review verdict is `warn` or `fail`, the `chrischall/workflows` pipeline opens or updates a single `auto-review-followup` issue ("Auto-review follow-ups for PR #N") whose checklist captures every finding, and links it from the PR's `<!-- auto-review-verdict -->` comment (`📋 Tracking follow-ups: #N`). `warn` (nits only) still auto-merges — the issue carries the nits forward, so most nits are fixed in a *later* PR; `fail` blocks until the important findings are addressed on the PR itself.

When asked to address the auto-review comments / review findings on a PR:

1. Read the verdict comment, open the linked `auto-review-followup` issue, and treat its checklist as the work list (alongside any inline review comments).
2. Resolve each item, checking off only what you've **verified** is genuinely fixed.
3. If every item is resolved on the current PR, add `Closes #<issue>` to that PR's body so the merge closes it; if some are deferred, check off only the resolved ones and leave the issue open.
4. For nits whose `warn` PR already auto-merged, address them in a follow-up PR that references `Closes #<issue>`.

(Mirrors the fleet-wide convention in `~/.claude/CLAUDE.md`.)
