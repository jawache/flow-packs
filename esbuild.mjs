// esbuild.mjs — build each pack into dist/<pack>.mjs.
//
// A project installs this package from a git tag, into node_modules, and node refuses to strip
// types there (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). So each tag holds built files.
// `@jawache/flow` is external: a pack uses the copy of flow its project has installed, which is
// what the peer dependency says.

import { build } from "esbuild";

export const PACKS = ["docs", "fcis", "git", "justfile", "node", "secrets", "tdd", "typescript"];

const production = process.argv.includes("--production");

await build({
  entryPoints: Object.fromEntries(PACKS.map((name) => [name, `packs/${name}.ts`])),
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  external: ["@jawache/flow"],
  sourcemap: !production,
  minify: false,
  logLevel: "warning",
});
