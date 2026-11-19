// packs/sample.ts — one concrete path a glob matches, for a pack's own cases.
//
// A case names a file, and in flow 0.4 that file runs through the rule's `.on(…)`, which a repo's
// parameters set. A case that names a path the pack invented falls outside another repo's globs and
// never reaches its rule, so a pack's case names `sample(<the glob its rule is on>)` instead.

/** One path `glob` matches: `**` stands for no folder, `*` and `?` for `a`, a brace set for its first choice. */
export function sample(glob: string): string {
  return glob
    .replace(/\{([^,}]*)[^}]*\}/g, "$1")
    .replace(/(^|\/)\*\*\//g, "$1")
    .replace(/\/\*\*$/, "/a")
    .replace(/^\*\*$/, "a")
    .replace(/[*?]/g, "a");
}
