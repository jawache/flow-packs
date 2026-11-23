# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.1.2](https://github.com/jawache/flow-packs/compare/v0.1.1...v0.1.2) (2026-11-23)

### Features

* **deploy:** a failed deploy files an issue with the last lines it printed, and Done runs just deploy (flow-packs-5/2) ([8841e73](https://github.com/jawache/flow-packs/commit/8841e734f4f77aa96a343b0151dccaa33a66b138))
* **deploy:** just deploy releases and pushes only when a feat, a fix or a breaking change landed (flow-packs-5/1) ([5fe81be](https://github.com/jawache/flow-packs/commit/5fe81bee85fec7f230bb966a6018f9735c579d31))
* **packs:** tdd's clauses hold one instruction each, and the descriptions say what the new text says (flow-packs-4) ([b3f0800](https://github.com/jawache/flow-packs/commit/b3f080092b921be004505e16124eb5a6f1cb6ca1))
* **packs:** the ten breadcrumbs are a purpose and clauses with IDs (flow-packs-4) ([9d5e2a6](https://github.com/jawache/flow-packs/commit/9d5e2a6f370714e79bd9f6b516cd0d985aa1f6d5))

### Bug Fixes

* **deploy:** count only plain version tags, push without a shell, fail on a broken git, refuse off the base branch, and undo a release that fails partway (flow-packs-5/6) ([3383fdb](https://github.com/jawache/flow-packs/commit/3383fdbcc050f71e06a13b60559e8a1bca7a8954))
* **deploy:** delete the release tags before the reset, keep the real failure when the undo fails, and prove the undo on a release with no new tag (flow-packs-5/6) ([70c501b](https://github.com/jawache/flow-packs/commit/70c501b499ee20dad7534f4c412bbde38c85d055))
* **deploy:** read the last release as the highest v* tag merged into HEAD, and make the test release the shape release.ts makes (flow-packs-5/4) ([7af9652](https://github.com/jawache/flow-packs/commit/7af965201260d62d3dca4d59c6477ab54b3dd5d4))
* **deploy:** share run and out with release.ts, tell an unreachable origin from a missing tag, and test a release that makes no tag (flow-packs-5/1) ([3e06f90](https://github.com/jawache/flow-packs/commit/3e06f909366766aade102b2e3f20f29ce70e2939))
* **deploy:** title a failed deploy after the merged issue past the release merge, and keep tests from filing real issues (flow-packs-5/2) ([f0a8716](https://github.com/jawache/flow-packs/commit/f0a871615d8f557086bff24a40a12730735a23be))
* **docs:** the two breadcrumb descriptions name the repo docs folder, and a test holds it (flow-packs-4/4) ([ba3c9ca](https://github.com/jawache/flow-packs/commit/ba3c9ca33abfbdcdd675926cf05f20ab330d5e4a))
* **fcis:** the coverage refusal says its command failed, not that coverage fell (flow-packs-3/1) ([5eb2229](https://github.com/jawache/flow-packs/commit/5eb2229048621d99c9d4ff1d1575febed8e0e69c))
* **secrets:** both pass cases reach their rules on flow 0.5.0 (flow-packs-2/1) ([4e891e2](https://github.com/jawache/flow-packs/commit/4e891e235683126738cc649c3a62751b55b3b611))
## [0.1.1](https://github.com/jawache/flow-packs/compare/v0.1.0...v0.1.1) (2026-11-19)

### Bug Fixes

* **justfile:** just install passes --allow-git=root, which npm 12 needs to fetch @jawache/flow from its tag ([35d70e6](https://github.com/jawache/flow-packs/commit/35d70e6f8f002100e7921791d647c6d2328b5a85))
* **packs:** every case names a path the repo's own parameters give, so it reaches its rule in any layout ([e73bce0](https://github.com/jawache/flow-packs/commit/e73bce0d1c46d2b40dbb77b796fe21df00331f89))
* **release:** the release merges its tag back with -s ours, so the next release counts from it (flow-packs-1) ([11dae41](https://github.com/jawache/flow-packs/commit/11dae41f6d57ae3f280340c388c31935287cd3c0))
## 0.1.0 (2026-11-19)

### Features

* **packs:** eight packs for flow 0.4, moved from flow's guards/, one import each ([e55e4ce](https://github.com/jawache/flow-packs/commit/e55e4ce94a0e539c92971159c91506b5d8efda06))
