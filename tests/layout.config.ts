// tests/layout.config.ts — every pack bound again, with a second repo's layout: other folders, other
// file names, every path parameter moved. A case that names a path the pack invented, rather than
// one its parameters give, falls outside this repo's globs, never reaches its rule, and fails here.
// `just test-rules` runs this config and tests/all.config.ts.

import { defineConfig, pack } from "@jawache/flow";
import { docs } from "../packs/docs.ts";
import { fcis } from "../packs/fcis.ts";
import { git } from "../packs/git.ts";
import { justfile } from "../packs/justfile.ts";
import { node } from "../packs/node.ts";
import { secrets } from "../packs/secrets.ts";
import { tdd } from "../packs/tdd.ts";
import { typescript } from "../packs/typescript.ts";

const PURE = ["src/lib/**/domain.ts"];

export default defineConfig([
  pack(docs, { root: "documentation" }),
  pack(fcis, {
    files: PURE,
    homes: ["src/lib/**"],
    coverage: "make coverage",
    example: "src/lib/basket/domain.ts",
    sibling: "{dir}/__tests__/{name}.spec.ts",
    tests: "**/__tests__/**",
  }),
  pack(git, { release: "make release", versionFile: "Cargo.toml" }),
  pack(justfile, { exempt: ["deploy"], tools: "scripts" }),
  pack(node),
  pack(secrets, { envFiles: "config/.env*", localFiles: ["config/.env.keys"] }),
  pack(tdd, { run: "make test", tests: ["**/__tests__/**/*.spec.ts"] }),
  pack(typescript, { typecheck: "make types", lint: "make lint" }),
]);
