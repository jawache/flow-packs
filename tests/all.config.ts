// tests/all.config.ts — every pack bound once, so `flow test tests/all.config.ts` runs every entry's
// own `.test({ pass, block })` cases. The parameters are a sample repo's, chosen to load every entry.

import { defineConfig, pack } from "@jawache/flow";
import { docs } from "../packs/docs.ts";
import { fcis } from "../packs/fcis.ts";
import { git } from "../packs/git.ts";
import { justfile } from "../packs/justfile.ts";
import { node } from "../packs/node.ts";
import { secrets } from "../packs/secrets.ts";
import { tdd } from "../packs/tdd.ts";
import { typescript } from "../packs/typescript.ts";

const PURE = ["**/domain.ts"];

export default defineConfig([
  pack(docs),
  pack(fcis, { files: PURE, homes: PURE, coverage: "just test-coverage", example: "src/basket/domain.ts" }),
  pack(git, { release: "just release" }),
  pack(justfile, { exempt: [] }),
  pack(node),
  pack(secrets, { dx: "just dx", encrypt: "just env-encrypt", custody: "file" }),
  pack(tdd, { run: "just test" }),
  pack(typescript, { typecheck: "just typecheck", lint: "just lint", tsconfigBase: "./tsconfig.base.json", eslintBase: "./eslint.config.base.js" }),
]);
