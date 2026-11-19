# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.1.1](https://github.com/jawache/flow-packs/compare/v0.1.0...v0.1.1) (2026-11-19)

### Bug Fixes

* **justfile:** just install passes --allow-git=root, which npm 12 needs to fetch @jawache/flow from its tag ([35d70e6](https://github.com/jawache/flow-packs/commit/35d70e6f8f002100e7921791d647c6d2328b5a85))
* **packs:** every case names a path the repo's own parameters give, so it reaches its rule in any layout ([e73bce0](https://github.com/jawache/flow-packs/commit/e73bce0d1c46d2b40dbb77b796fe21df00331f89))
* **release:** the release merges its tag back with -s ours, so the next release counts from it (flow-packs-1) ([11dae41](https://github.com/jawache/flow-packs/commit/11dae41f6d57ae3f280340c388c31935287cd3c0))
## 0.1.0 (2026-11-19)

### Features

* **packs:** eight packs for flow 0.4, moved from flow's guards/, one import each ([e55e4ce](https://github.com/jawache/flow-packs/commit/e55e4ce94a0e539c92971159c91506b5d8efda06))
