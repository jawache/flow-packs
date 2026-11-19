// packs/justfile.ts
import {
  banCommands,
  breadcrumb,
  command,
  commit,
  defineCheck,
  definePack,
  guardrail,
  jsonInvariant,
  session,
  fileChange
} from "@jawache/flow";
var RESERVED = /* @__PURE__ */ new Set(["set", "alias", "export", "import", "mod", "unexport"]);
function undocumentedRecipes(text, exempt = []) {
  const ex = new Set(exempt);
  const lines = text.split("\n");
  const bad = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^(@?[A-Za-z_][A-Za-z0-9_-]*)(\s|:)/.exec(line);
    if (!m?.[1]) continue;
    const name = m[1].replace(/^@/, "");
    if (RESERVED.has(name) || ex.has(name)) continue;
    const colon = line.indexOf(":");
    if (colon === -1 || line[colon + 1] === "=") continue;
    let excused = false;
    for (let j = i - 1; j >= 0; j--) {
      const above = lines[j];
      if (!/^\[.*\]\s*$/.test(above)) break;
      if (/\bdoc\(/.test(above) || /\bprivate\b/.test(above)) {
        excused = true;
        break;
      }
    }
    if (!excused) bad.push({ name, line: i + 1 });
  }
  return bad;
}
var justfileDocs = defineCheck(
  (opts) => (ctx) => {
    const bad = undocumentedRecipes(ctx.file?.content ?? "", opts.exempt ?? []);
    return bad.length === 0 ? ctx.ok() : ctx.fail(bad.map((r) => `recipe '${r.name}' (line ${r.line}) has no [doc("\u2026")] attribute`).join("\n"));
  }
);
var justfile = definePack("justfile", (repo) => {
  const tools = repo.tools ?? "tools";
  const recipes = repo.recipes ?? {};
  return {
    /**
     * Without it, an agent discovers commands from package.json, from memory, or from a README that
     * has drifted — and reaches for a tool this repo does not have, or hand-runs the chain a recipe
     * already spells correctly.
     */
    orientation: breadcrumb().at(session).description("Where the repo's tooling is catalogued, what earns a recipe, and what stays a script.").text(
      [
        "The justfile is this repo's tool catalogue \u2014 the single source of truth for the tooling you can confidently reach for. Run `just` FIRST to see what you can do here; do not discover commands from package.json or memory.",
        `A recipe means: reach for this repeatedly, with confidence. Recipes stay thin \u2014 the code behind one lives in \`${tools}/\`; one-off operational scripts live there too and never become recipes.`,
        `A one-off command or chain is fine to run directly. Anything you'll run more than once becomes a script. A script earns a recipe (with a [doc("\u2026")]) only when it is run REGULARLY, across tasks; who runs it is not the test. A one-off or per-release step (a seed, a backfill, a data fix) runs as a script by hand and gets no recipe.`,
        "If a service offers a CLI, prefer it over an MCP \u2014 a command is recorded, guardable and reproducible."
      ].join("\n")
    ),
    /**
     * Without it, everything in the tools folder is treated the same way: one-shots get promoted
     * into the catalogue until `just --list` is noise, or a genuinely repeatable tool is left with
     * no recipe pointing at it and nobody finds it again.
     */
    toolsHome: breadcrumb().at(fileChange).on(`${tools}/**`).description(`The fork every file in ${tools}/ faces \u2014 catalogue entry, or one-shot.`).text(
      [
        `You are writing into \`${tools}/\` \u2014 the implementation layer, not the catalogue. Decide which of two things this file is:`,
        `Run REGULARLY, across tasks \u2014 part of the catalogue? Then it also needs a thin justfile recipe pointing at it, with a [doc("\u2026")] \u2014 a tool that exists only in \`${tools}/\` is undiscoverable.`,
        "A one-off (a migration, a backfill, a seed, a release's data step, a workflow step)? Then it gets NO recipe, even if a human runs it and even if it runs once per environment \u2014 one-shots promoted into the catalogue are how `just --list` becomes noise and stops being trustworthy."
      ].join("\n")
    ),
    node: {
      /**
       * Without it, package.json grows a second command surface — the one an agent reads FIRST, out
       * of habit — and the two drift until the catalogue is no longer the truth about this repo.
       */
      noPackageScripts: guardrail().at(commit).on("package.json").description("package.json scripts stays empty \u2014 the justfile is the single command source.").check(jsonInvariant({ assert: [{ path: "scripts", keysPrefixedWith: "//" }] })).message(
        "package.json `scripts` must stay empty \u2014 the justfile is the catalogue, and a second command surface is one an agent reads instead of it. Only //-prefixed comment keys are allowed; move the command into a justfile recipe."
      ).test({
        pass: [{ path: "package.json", content: '{"scripts":{"//":"see the justfile"}}' }],
        block: [{ path: "package.json", content: '{"scripts":{"dev":"vite"}}' }]
      })
    },
    /**
     * Without it, `just --list` falls back to the last comment line above a recipe, which for a
     * multi-line comment block is a mid-sentence fragment — a help screen assembled by accident, and
     * a tool nobody can choose from its description.
     */
    justfileDocs: guardrail().at(commit).on("justfile").description("Every justfile recipe carries an explicit [doc] \u2014 `just --list` is the catalogue's help screen.").check(justfileDocs({ exempt: repo.exempt })).message(
      "Every non-private justfile recipe needs an explicit [doc(\"\u2026\")] \u2014 `just --list` is the tool catalogue's help screen, and an undocumented recipe is a tool nobody can choose. ([private] recipes are exempt; they're hidden from the listing.)"
    ).test({
      pass: [
        { path: "justfile", content: '[doc("Run the suite.")]\ntest:\n    npx vitest run\n' },
        // Hidden from `just --list`, so it is not in the catalogue and owes it nothing.
        { path: "justfile", content: "[private]\n_helper:\n    echo hi\n" },
        // An assignment and a `set` line are not recipes at all.
        { path: "justfile", content: 'set shell := ["bash", "-c"]\nport := "3000"\n' },
        // …nor are the other words that open a construct at column 0. `import` and `mod` carry no
        // colon at all, so only the reserved list keeps them from being read as recipe names.
        { path: "justfile", content: 'import "other.just"\nmod sub\n[doc("Run it.")]\ntest:\n    npx vitest run\n' },
        // ATTRIBUTES STACK, and the walk goes up over the whole contiguous run, so either one
        // excuses the recipe in either order. A walk that read only the line immediately above
        // would start refusing a private recipe the moment somebody documented it as well.
        { path: "justfile", content: '[private]\n[doc("why")]\na:\n    echo x\n' },
        { path: "justfile", content: '[doc("why")]\n[private]\nb:\n    echo x\n' },
        // A BODY line is indented, however recipe-shaped it reads. This one spells a colon after a
        // word and is still a shell command inside `a`.
        { path: "justfile", content: '[doc("why")]\na:\n    echo "test: not a recipe"\n' }
      ],
      block: [
        { path: "justfile", content: "test:\n    npx vitest run\n" },
        // THE WALK STOPS at the first line that is not an attribute, so the doc attached to `a`
        // does not reach down to `b`. One documented recipe excusing every recipe beneath it is
        // what that stop exists to prevent.
        { path: "justfile", content: '[doc("belongs to a")]\na:\n    echo x\nb:\n    echo y\n' },
        // A recipe with PARAMETERS is named before a space rather than before a colon, and one
        // written with a leading `@` is the same recipe run quietly. Both are in `just --list`, so
        // both owe it a description.
        { path: "justfile", content: "greet name:\n    echo {{name}}\n" },
        { path: "justfile", content: "@quiet:\n    echo hi\n" }
      ]
    }),
    // NO MAP, NO ENTRY. Which raw commands a repo has wrapped is that repo's fact, and an entry
    // bound with an empty list is one more armed rule matching nothing — the shape this pack
    // exists to refuse.
    ...Object.keys(recipes).length === 0 ? {} : {
      useTheRecipe: guardrail().at(command).description("A command the repo has a recipe for is refused, and the refusal names the recipe.").check(banCommands({ ban: Object.keys(recipes) })).message(
        [
          "This repo has a recipe for that command \u2014 use it. The catalogue is the tooling you can reach for with confidence, and a raw command run beside it is the one nobody sees, nobody documents and nobody can change in one place.",
          ...Object.entries(recipes).map(([raw, recipe]) => `\xB7 \`${raw}\` \u2192 \`${recipe}\``)
        ].join("\n")
      ).test({
        pass: [
          Object.values(recipes)[0] ?? "just test",
          `python3 - <<'PY'
print("${Object.keys(recipes)[0] ?? "npx vitest run"}")
PY`,
          `echo '${Object.keys(recipes)[0] ?? "npx vitest run"}'`,
          `gh issue create --body "the builder ran ${Object.keys(recipes)[0] ?? "npx vitest run"} instead"`
        ],
        block: [
          Object.keys(recipes)[0] ?? "npx vitest run",
          `python3 - <<'PY'
print("x")
PY
${Object.keys(recipes)[0] ?? "npx vitest run"}`,
          `cd app && ${Object.keys(recipes)[0] ?? "npx vitest run"}`
        ]
      })
    }
  };
});
export {
  justfile,
  undocumentedRecipes
};
