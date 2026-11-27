/** What this pack cannot know: the suite recipe, and how this repo spells a test file. */
export interface Suite {
    /**
     * The recipe that runs the deterministic suite — for example `just test-commit` or `npm test`.
     *
     * MANDATORY rather than defaulted: which command is the gate is a repo's fact, and a default is
     * a rule that runs the wrong suite in every repo whose gate has another name.
     */
    readonly run: string;
    /**
     * Every spelling of a test file. Defaults to the seven this fleet uses — `.test.` and `.spec.`
     * with `.ts`, `.tsx`, `.js` and `.mjs`.
     *
     * The strategy breadcrumb fires on them and the four `vitestIdioms` rules judge them, so a repo
     * that keeps its tests in `__tests__/` names that here rather than re-scoping five entries.
     */
    readonly tests?: readonly string[];
}
/**
 * Test-first artefacts exist; tests test behaviour, not implementation; the suite gates the commit.
 *
 * `commitRunsTests` takes the suite recipe as a mandatory PARAMETER rather than defaulting to
 * `just test`: which command is the deterministic gate is a repo's fact, and a default is a rule
 * that runs the wrong suite in every repo whose gate has another name.
 *
 * The `vitest/` sub-group holds FRAMEWORK spellings rather than testing principles: a repo on
 * another runner disables the four of them without losing the artefacts or the gate.
 *
 * @install vitest, unless the four `vitestIdioms` entries are disabled — every one of them reads a
 * vitest spelling.
 * @setup One recipe that runs the deterministic suite, named as the `run` parameter. It is what
 * the commit gate runs, so it has to be the whole suite and it has to be green.
 * @adopt A repo on another runner binds the pack and disables `vitest` and the `vitestIdioms`
 * group by name, keeping the strategy breadcrumb and the commit gate — that split is why the
 * framework rules are a sub-group rather than four loose entries.
 */
export declare const tdd: import("@jawache/flow").Pack<{
    /**
     * Without it, a test goes where it is easiest to write rather than on the lowest rung that proves
     * it — logic proved by starting a program or a browser, a new end-to-end test where an existing
     * one should gain a step, and tests pinned to implementation details.
     */
    testingStrategy: import("@jawache/flow").BreadcrumbSentence<"at" | "on" | "description" | "text", "file-change">;
    vitest: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
    vitestIdioms: {
        noMockInternal: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
        noOnlyInTests: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
        noNetworkStubs: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
        noEmptyTest: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
    };
    commitRunsTests: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "commit">;
}, Suite>;
