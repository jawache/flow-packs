/** What this pack cannot know: the two gate recipes, and whether the repo has shared config files. */
export interface Gates {
    /** The recipe that typechecks every project in one pass. */
    readonly typecheck: string;
    /** The recipe that lints the repo. */
    readonly lint: string;
    /**
     * The shared tsconfig every project must extend — a path (`./tsconfig.base.json`) or a package
     * name. Optional, and with nothing here the rule does not ask for one.
     *
     * flow ships no such file: a base states one fleet's opinion about target, module and lib, and a
     * neutral engine has no business having one. What the pack holds without it is the opinion that
     * travels — `strictOptions` below stay on wherever they are set.
     */
    readonly tsconfigBase?: string;
    /**
     * The shared eslint config the repo's own config must import — a path
     * (`./eslint.config.base.js`) or a package name. Optional; with nothing here there is no entry.
     */
    readonly eslintBase?: string;
    /**
     * The compiler options that may never be turned off. Defaults to `["strict",
     * "noUncheckedIndexedAccess"]`.
     *
     * Stated as option names under `compilerOptions`, each asserted `true`. This is the pack's whole
     * opinion when no base file is named.
     */
    readonly strictOptions?: readonly string[];
}
/**
 * TypeScript discipline as shared configuration: strict stays on, the checker is never silenced.
 *
 * This pack does not re-implement a linter. The escape hatches — `@ts-expect-error`, explicit
 * `any`, double assertions — are typescript-eslint's `strictTypeChecked` job, and it does it
 * better than a hand-rolled pattern can. What is left is the half a linter cannot do: keep the
 * repo's own configs pointing at a shared base, run both tools at the gate, and teach the design
 * habit no tool checks.
 *
 * @setup The two gate recipes, and nothing else. THIS PACK SHIPS NO FILE: a base states one
 * fleet's opinion about target, module and lib, and a neutral engine has no business having one,
 * so with no base named the pack holds only the opinion that travels — the strict options stay on
 * wherever they are set.
 *
 * A shared base is still worth having, and a repo that keeps one names it in `tsconfigBase` and
 * `eslintBase`; the two rules then hold every project to it. REFERENCE below, not a file to match:
 * the smallest base that carries the opinion, to copy as `tsconfig.base.json` and then add a
 * repo's own emit and module settings to. Every `tsconfig*.json` extends it.
 *
 * ```json
 * {
 *   "compilerOptions": {
 *     "strict": true,
 *     "noUncheckedIndexedAccess": true,
 *     "exactOptionalPropertyTypes": true,
 *     "noImplicitOverride": true,
 *     "noFallthroughCasesInSwitch": true,
 *     "noUnusedLocals": true,
 *     "noUnusedParameters": true
 *   }
 * }
 * ```
 *
 * …and the lint half as `eslint.config.base.js`, which the repo's own `eslint.config.js` imports
 * and spreads. It is deliberately not a hand-rolled rule set: `strictTypeChecked` is the maintained
 * good-patterns set, it already holds the escape hatches at error, and it supersedes every idiom
 * rule a pack could write. `projectService` is what makes the type-aware rules work at all.
 *
 * ```js
 * import tseslint from "typescript-eslint";
 *
 * export default tseslint.config(
 *   { ignores: ["dist/**", "coverage/**"] },
 *   ...tseslint.configs.strictTypeChecked,
 *   {
 *     languageOptions: {
 *       parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
 *     },
 *   },
 * );
 * ```
 * @adopt Bind it with the two gate recipes this repo really has. Expect the first commit after
 * binding to run both tools over everything — a repo that has been typechecking one project at a
 * time usually finds errors in the ones nobody was checking.
 */
export declare const typescript: import("@jawache/flow").Pack<{
    commitRunsTsc: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "commit">;
    commitRunsEslint: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "commit">;
    eslintFromBase?: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
    /**
     * Without it, strictness is treated as a setting rather than a design tool: the escape hatches
     * get reached for under time pressure, and impossible states go on being representable because
     * nothing ever said to model them out.
     */
    strictTypesNoInvalidStates: import("@jawache/flow").BreadcrumbSentence<"at" | "on" | "description" | "text", "file-change">;
    /**
     * Without it, a project quietly stops extending the shared base — or extends it and then turns
     * `strict` back off — and the fleet's one standard becomes per-project taste that only shows up
     * as a bug much later.
     */
    tsconfigStrict: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
}, Gates>;
