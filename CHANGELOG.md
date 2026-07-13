# Changelog

## [0.4.5](https://github.com/chrischall/realty-mcp/compare/v0.4.4...v0.4.5) (2026-07-13)


### Documentation

* register hemnet-mcp as a realty-meta portal source ([#37](https://github.com/chrischall/realty-mcp/issues/37)) ([fc163ce](https://github.com/chrischall/realty-mcp/commit/fc163cef64e36472173141c4b46699c3e9b2bba4))

## [0.4.4](https://github.com/chrischall/realty-mcp/compare/v0.4.3...v0.4.4) (2026-06-17)


### Documentation

* document Conventional Commit PR-title requirement for release-please ([#33](https://github.com/chrischall/realty-mcp/issues/33)) ([669a608](https://github.com/chrischall/realty-mcp/commit/669a6082424fda99b55f24e962edad4eb821b9e5))
* refresh CLAUDE.md and add auto-review follow-up convention ([#35](https://github.com/chrischall/realty-mcp/issues/35)) ([99bfc27](https://github.com/chrischall/realty-mcp/commit/99bfc270288e2d20110bccb515e517f34c620d12))

## [0.4.3](https://github.com/chrischall/realty-mcp/compare/v0.4.2...v0.4.3) (2026-06-13)


### Bug Fixes

* bot PRs bypass the CI gate unconditionally ([#28](https://github.com/chrischall/realty-mcp/issues/28)) ([2023521](https://github.com/chrischall/realty-mcp/commit/20235216bed55760d30e7b351eeffbcbaecb2eb9))


### Documentation

* declare MIT license and add README badges ([#30](https://github.com/chrischall/realty-mcp/issues/30)) ([e350b09](https://github.com/chrischall/realty-mcp/commit/e350b098f33479648461941bf744989d0b1a60a5))

## [0.4.2](https://github.com/chrischall/realty-mcp/compare/v0.4.1...v0.4.2) (2026-06-09)


### Bug Fixes

* replace require('node:fs') with ESM import in LocalityAliasMap.fromFile ([#24](https://github.com/chrischall/realty-mcp/issues/24)) ([a672174](https://github.com/chrischall/realty-mcp/commit/a67217465bb333c5f18a5a1245cb24713968ba4e))

## [0.4.1](https://github.com/chrischall/realty-mcp/compare/v0.4.0...v0.4.1) (2026-05-29)


### Bug Fixes

* **ci:** treat instant-merge race as success in auto-merge arm ([#20](https://github.com/chrischall/realty-mcp/issues/20)) ([6de13c0](https://github.com/chrischall/realty-mcp/commit/6de13c0aab5ee06998311370cd7abc8abf44de80))
* **realty-core:** accurate package description + majority geo guard ([#22](https://github.com/chrischall/realty-mcp/issues/22)) ([68f63d0](https://github.com/chrischall/realty-mcp/commit/68f63d036664d60b9155b2f06b954dc8241e7def))

## [0.4.0](https://github.com/chrischall/realty-mcp/compare/v0.3.1...v0.4.0) (2026-05-29)


### Features

* **realty-core:** marina place-name guard + completed→Sold event synonym ([#18](https://github.com/chrischall/realty-mcp/issues/18)) ([8663433](https://github.com/chrischall/realty-mcp/commit/866343397f7d1ea64ed91cd070abfb35acd06f3d))

## [0.3.1](https://github.com/chrischall/realty-mcp/compare/v0.3.0...v0.3.1) (2026-05-29)


### Bug Fixes

* **core:** sqftToAcres guards sub-2dp lots to null so the documented "never 0" holds ([#16](https://github.com/chrischall/realty-mcp/issues/16)) ([4297082](https://github.com/chrischall/realty-mcp/commit/42970820ee879d195a68a64ac2b6cb1ab43b0580))

## [0.3.0](https://github.com/chrischall/realty-mcp/compare/v0.2.0...v0.3.0) (2026-05-28)


### Features

* **core:** add address-alternates + event-type + lastSold (cohort candidates D, E, P) ([#12](https://github.com/chrischall/realty-mcp/issues/12)) ([22d1f74](https://github.com/chrischall/realty-mcp/commit/22d1f74f5c217f960958876a24c9c4b6aaaf452b))
* **core:** add cleanTaxAnnual + buildHyperlinkFormula (cohort candidates K, L) ([#10](https://github.com/chrischall/realty-mcp/issues/10)) ([a75fea5](https://github.com/chrischall/realty-mcp/commit/a75fea52c2ffa18974a52e2787ac9c840e8f08f0))
* **core:** add estimateRentVsBuy — unified rent-vs-buy projection (cohort candidate I) ([#15](https://github.com/chrischall/realty-mcp/issues/15)) ([682bfd9](https://github.com/chrischall/realty-mcp/commit/682bfd95479de74e64948da495474c7b5dbcf758))
* **core:** add extractFeatures + ExtractedFeatures (cohort candidate J) ([#9](https://github.com/chrischall/realty-mcp/issues/9)) ([aa6dc80](https://github.com/chrischall/realty-mcp/commit/aa6dc8004357c7983891c5607bc4e11057604f04))
* **core:** add hoaToMonthlyUsd + daysSince + priceDrop (cohort candidates A, B, C) ([#13](https://github.com/chrischall/realty-mcp/issues/13)) ([f7151ac](https://github.com/chrischall/realty-mcp/commit/f7151ac8c8c9363d9a01f4d9ecbcd1b3d154453f))
* **core:** add sqftToAcres lot-size unit conversion ([#7](https://github.com/chrischall/realty-mcp/issues/7)) ([818b16a](https://github.com/chrischall/realty-mcp/commit/818b16ad182bff93df265223551899dde89d0208))
* **core:** add urlToPath + locationToSlug + zip-geo helpers (cohort candidates F, G, H) ([#14](https://github.com/chrischall/realty-mcp/issues/14)) ([e70ece4](https://github.com/chrischall/realty-mcp/commit/e70ece4d3874b54cccb600e2253405a67a8519db))

## [0.2.0](https://github.com/chrischall/realty-mcp/compare/v0.1.0...v0.2.0) (2026-05-28)


### Features

* **core:** add calculateAffordability — hoist DTI inverse-PMT from realty cohort ([#2](https://github.com/chrischall/realty-mcp/issues/2)) ([326b6d0](https://github.com/chrischall/realty-mcp/commit/326b6d078e2be859dc44677803f699a183079c47))
* **core:** add calculateMortgage ([#3](https://github.com/chrischall/realty-mcp/issues/3)) ([0c3dce7](https://github.com/chrischall/realty-mcp/commit/0c3dce7b4ddb33a47a09765c2b5e451bdd618553))
* **core:** initial scaffold + address-match + street-variants + locality-alias + parse-address ([7e27841](https://github.com/chrischall/realty-mcp/commit/7e27841f8df552514832f7853e406109518d4404))


### Documentation

* append cohort-survey hoist candidates A-I to CANDIDATE_LOGIC.md ([#6](https://github.com/chrischall/realty-mcp/issues/6)) ([4f1c0d8](https://github.com/chrischall/realty-mcp/commit/4f1c0d89e647a40c92eba5aa4ccfc5045839b08f))
