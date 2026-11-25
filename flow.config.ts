// flow.config.ts — this repo's guard. It binds the packs it ships from their source, so a pack
// that stops loading refuses this repo's own next commit first.

import { defineConfig, override, pack } from "@jawache/flow";
import { flow } from "@jawache/flow/packs";
import { docs } from "./packs/docs.ts";
import { git } from "./packs/git.ts";
import { justfile } from "./packs/justfile.ts";
import { node } from "./packs/node.ts";
import { tdd } from "./packs/tdd.ts";
import { typescript } from "./packs/typescript.ts";
import { work } from "./packs/work.ts";

export default defineConfig([
  pack(flow),
  pack(git, { release: "just release" }),
  pack(justfile, { exempt: [] }),
  pack(node),
  pack(typescript, { typecheck: "just typecheck", lint: "just lint", tsconfigBase: "./tsconfig.base.json", eslintBase: "./eslint.config.base.js" }),
  override(typescript.commitRunsEslint).disabled("no eslint in this repo yet: the typecheck is the gate"),
  pack(tdd, { run: "just test-commit" }),
  pack(docs),
  // This repo is driven by work: bound from `./packs/work.ts`, as the packs this repo ships are.
  pack(work),
]);
