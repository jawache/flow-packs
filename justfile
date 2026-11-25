# flow-packs — the tool catalogue. `just` lists it.

set positional-arguments

[doc("List the recipes.")]
default:
    @just --list --unsorted

[doc("Install dependencies from the lockfile. Run this first in a fresh clone or worktree.")]
install:
    # --allow-git=root: npm 12 fetches a git dependency only when told to, and @jawache/flow is one.
    npm ci --allow-git=root

[doc("Build every pack into dist/<pack>.mjs, with its types in dist/types/. A project's flow loads the built files, never the source.")]
build:
    node esbuild.mjs
    rm -rf dist/types
    npx tsc -p tsconfig.build.json

[doc("The build a release tag holds: the same bundles, with no sourcemaps.")]
build-release:
    node esbuild.mjs --production
    rm -rf dist/*.map dist/types
    npx tsc -p tsconfig.build.json

[doc("Typecheck every file: the packs, their tests, the configs and tools/.")]
typecheck:
    npx tsc -p tsconfig.json

[doc("Run the unit tests. Takes a test file and a name, like `just test packs/packs.test.ts \"the packs\"`.")]
test *args:
    npx vitest run "$@"

[doc("Run every entry's own .test({ pass, block }) cases, with all nine packs bound twice: by tests/all.config.ts, and by tests/layout.config.ts, a second repo's folders and file names, so a case that names a path the pack invented fails here.")]
test-rules:
    node node_modules/@jawache/flow/dist/flow.mjs test tests/all.config.ts
    node node_modules/@jawache/flow/dist/flow.mjs test tests/layout.config.ts

[doc("The fast gate, which the commit gate runs on every commit: the typecheck, the unit tests and every entry's cases.")]
test-commit:
    just typecheck
    just test
    just test-rules

[doc("Is this repo's own guard working: every rule loads, and every fitting is in place.")]
guard-status:
    node node_modules/@jawache/flow/dist/flow.mjs status

[doc("Cut a release, locally: compute the version from the conventional commits since the last tag, write CHANGELOG.md, stamp package.json and the lockfile, and make the `chore(release): x.y.z` commit. Then build for release, make a second commit above it that holds dist/, and tag that one `vx.y.z`. Nothing is pushed.")]
release *args:
    just test-commit
    node tools/release.ts cut "$@"

[doc("What `just release` would do: the version and the changelog entry, printed. Writes nothing.")]
release-dry:
    npx commit-and-tag-version --dry-run

[doc("Everything that must be true before a release: the fast gate, then the release made in a throwaway clone, installed from its tag into a scratch project beside flow, and every pack bound from the installed package with its cases run. Pushes nothing.")]
release-check *args:
    just test-commit
    node tools/release.ts check "$@"

[doc("Release and push, only when a feat, a fix or a breaking change landed since the last tag: install from the lockfile, `just release-check`, `just release`, then push the branch and the new tag, then emit `work event release.cut` for it. A failed step stops it before any later one. A release tagged here and missing on origin is pushed by the next deploy. Never prompts.")]
deploy:
    node tools/deploy.ts
