// packs/typescript.ts
import { astGrep, commit, breadcrumb, definePack, escapeRe, execPasses, guardrail, jsonInvariant, fileChange } from "@jawache/flow";
var typescript = definePack("typescript", (repo) => {
  const strictOptions = repo.strictOptions ?? ["strict", "noUncheckedIndexedAccess"];
  const base = repo.tsconfigBase;
  const asserts = [
    ...base === void 0 ? [] : [{ path: "extends", matches: `${escapeRe(base)}$`, required: true }],
    ...strictOptions.map((option) => ({ path: `compilerOptions.${option}`, equals: true }))
  ];
  return {
    /**
     * Without it, strictness is treated as a setting rather than a design tool: the escape hatches
     * get reached for under time pressure, and impossible states go on being representable because
     * nothing ever said to model them out.
     */
    strictTypesNoInvalidStates: breadcrumb().at(fileChange).on("**/tsconfig*.json", "eslint.config.*").description("Use the type system as a design tool \u2014 strict stays on, impossible states stay impossible.").text(
      [
        `Purpose. ${strictOptions.map((option) => `\`${option}\``).join(" and ")} ${base === void 0 ? "stay on wherever they are set" : `come from the committed \`${base}\``}. A red squiggle is a defect found, not a setting to relax. The linter holds the escape hatches (@ts-expect-error, explicit any, double assertions) at error, and does that job better than a rule of this pack could.`,
        "## Rules",
        "- `TYP-R1` Do not weaken strictness.",
        "- `TYP-R2` Make an exception a visible, local, per-rule override, on the record.",
        "- `TYP-R3` Model state so the impossible cannot be constructed.",
        "- `TYP-R4` Replace two sibling booleans, such as isLoading and isError, with a discriminated union.",
        '  why: It makes the invalid combination unrepresentable (Vanderkam, Effective TypeScript; Feldman, "Make Impossible States Impossible").'
      ].join("\n")
    ),
    // `**/tsconfig.json`, not `tsconfig.json`. The narrow glob made the rule true by accident: this
    // repo has four TypeScript projects, the root one did not exist, and the three that did were
    // invisible for as long as the rule watched only the repo root. Widening it turned one silent
    // pass into three real checks and 69 type errors (2026-08-13).
    /**
     * Without it, a project quietly stops extending the shared base — or extends it and then turns
     * `strict` back off — and the fleet's one standard becomes per-project taste that only shows up
     * as a bug much later.
     */
    tsconfigStrict: guardrail().at(commit).on("**/tsconfig.json").description(
      base === void 0 ? `Every tsconfig.json keeps ${strictOptions.join(" and ")} on.` : `Every tsconfig.json extends ${base} and keeps ${strictOptions.join(" and ")} on.`
    ).check(jsonInvariant({ assert: asserts })).message(
      [
        base === void 0 ? `This tsconfig turns off one of ${strictOptions.join(" / ")}. A red squiggle is a defect found, not a setting to relax.` : `This tsconfig must extend \`${base}\`, and it must not turn ${strictOptions.join(" or ")} back off. Weakening the strictness means changing the shared base once, visibly, not this project quietly.`
      ].join("\n")
    ).test({
      pass: [
        {
          path: "cli/tsconfig.json",
          content: base === void 0 ? '{"compilerOptions":{"strict":true,"noUncheckedIndexedAccess":true}}' : `{"extends":"${base}"}`
        }
      ],
      block: [
        { path: "cli/tsconfig.json", content: '{"compilerOptions":{"strict":false}}' },
        {
          path: "cli/tsconfig.json",
          content: base === void 0 ? '{"compilerOptions":{"noUncheckedIndexedAccess":false}}' : `{"extends":"${base}","compilerOptions":{"strict":false}}`
        }
      ]
    }),
    // ast-grep rather than jsonInvariant for one reason: an eslint flat config is JavaScript, so
    // there is no JSON to read a key out of.
    /**
     * Without it, a repo lints to its own private standard while its config claims the fleet's —
     * the rules that catch the escape hatches this pack stopped hand-rolling are simply not on.
     */
    // NO BASE, NO ENTRY: a repo that has not named a shared eslint config has nothing for this rule
    // to be about, and an entry demanding a file nobody ships is a rule that refuses every repo.
    ...repo.eslintBase === void 0 ? {} : {
      eslintFromBase: guardrail().at(commit).on("eslint.config.js", "eslint.config.mjs").description(`The repo's eslint config imports ${repo.eslintBase}.`).check(
        astGrep({
          language: "javascript",
          rule: {
            kind: "program",
            not: { has: { stopBy: "end", kind: "string", regex: escapeRe(repo.eslintBase) } }
          }
        })
      ).message(
        [
          `This eslint config does not import \`${repo.eslintBase}\`. The shared rules live there \u2014 a config that does not import it lints to a private standard while this repo's guard claims the shared one.`,
          `Fix: \`import base from "${repo.eslintBase}";\` and spread it, then add only what is genuinely local to this repo.`
        ].join("\n")
      ).test({
        pass: [{ path: "eslint.config.js", content: `import base from "${repo.eslintBase}";
export default [...base];
` }],
        block: [{ path: "eslint.config.js", content: "export default [];\n" }]
      })
    },
    commitRunsTsc: guardrail().at(commit).description("Runs the whole-project typecheck at commit and blocks on any type error.").check(execPasses({ run: repo.typecheck })).message(
      `The typecheck failed (\`${repo.typecheck}\`) \u2014 the commit is blocked until types are clean. tsc catches the cross-file mismatches a file-at-a-time build never sees: a change that compiled here and broke a caller there.`
    ).test({
      pass: [{ staged: ["cli/a.ts"], world: { exec: { [repo.typecheck]: { code: 0 } } } }],
      block: [{ staged: ["cli/a.ts"], world: { exec: { [repo.typecheck]: { code: 1, stdout: "a.ts(1,1): error TS2322" } } } }]
    }),
    commitRunsEslint: guardrail().at(commit).description("Runs the lint at commit and blocks on any error.").check(execPasses({ run: repo.lint })).message(
      `The lint failed (\`${repo.lint}\`) \u2014 the commit is blocked until it is clean. This is where the escape hatches are held (floating promises, explicit any, ts-comments); fix the finding, or override that one rule visibly and locally.`
    ).test({
      pass: [{ staged: ["cli/a.ts"], world: { exec: { [repo.lint]: { code: 0 } } } }],
      block: [{ staged: ["cli/a.ts"], world: { exec: { [repo.lint]: { code: 1, stdout: "error  Unsafe assignment" } } } }]
    })
  };
});
export {
  typescript
};
