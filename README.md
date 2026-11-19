# flow-packs

Packs of guardrails and breadcrumbs for [flow](https://github.com/jawache/flow) 0.4. A pack is a set of rules a project binds in its `flow.config.ts`. flow itself ships one pack, `flow`, which guards the guard. These eight are about how you work, so they live here.

| Pack | What it holds | Parameters |
| --- | --- | --- |
| `docs` | `docs/` holds `user/` for people and `agent/` for agents, and the style of each | none required |
| `fcis` | Functional core, imperative shell: pure code stays pure, and its coverage gates the commit | `files`, `homes`, `coverage`, `example` |
| `git` | Conventional Commit headers, computed versions, no attribution, no gate skipped | `release` |
| `justfile` | The justfile is the tool catalogue, and every recipe has a `[doc]` | `exempt` |
| `node` | A commit that moves a dependency says why, and carries the lockfile | none |
| `secrets` | Env files committed encrypted, decrypted through one seam | none required |
| `tdd` | Tests that test behaviour, and the suite gates the commit | `run` |
| `typescript` | Strict TypeScript, and the typecheck and lint gate the commit | `typecheck`, `lint` |

Each pack's parameters are typed. Binding one without a required parameter does not compile.

## Install

flow-packs is installed from a git tag, beside flow. Nothing is published to npm.

```sh
npm i -D --allow-git=root github:jawache/flow#v0.4.0 github:jawache/flow-packs#v0.1.0
```

Each tag holds the built packs, so nothing is built when you install. The packs use the copy of flow your project has installed: flow is a peer dependency, `>=0.4.0 <0.5.0`.

## Bind

Import each pack you want from its own path, and bind it with `pack(…)`:

```ts
import { defineConfig, pack } from "@jawache/flow";
import { flow } from "@jawache/flow/packs";
import { git } from "@jawache/flow-packs/git";
import { secrets } from "@jawache/flow-packs/secrets";

export default defineConfig([
  pack(flow),
  pack(git, { release: "just release" }),
  pack(secrets),
]);
```

`tests/all.config.ts` binds all eight with sample parameters.

## Work on the packs

| Command | What it does |
| --- | --- |
| `just install` | Installs the dependencies, flow among them |
| `just test-commit` | The fast gate: the typecheck, the unit tests and every entry's own cases. The commit gate runs it |
| `just build` | Builds `dist/<pack>.mjs` and `dist/types/` |
| `just release-check` | Makes the release in a throwaway clone, installs it into a scratch project beside flow, and runs every pack's cases from the installed files |
| `just release` | Makes the release commit, then a second commit that holds `dist/`, and tags it. Pushes nothing |

The version is computed from the Conventional Commit headers since the last tag. A release is pushed by hand:

```sh
git push origin HEAD && git push origin v<version>
```
