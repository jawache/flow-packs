/** Where a repo's pure code lives, and what proves it. Stated by the repo; nothing is defaulted. */
export interface Convention {
    /** Every pure FILE — what the rails judge, one glob per shape the repo actually uses. */
    readonly files: readonly string[];
    /** Every pure HOME — where the teaching breadcrumb fires, and what the coverage gate watches. */
    readonly homes: readonly string[];
    /** The recipe that runs the coverage gate. */
    readonly coverage: string;
    /**
     * ONE PURE FILE, spelled out — a path both `files` and `homes` match.
     *
     * `pureCovered` and `newPureFileNeedsReason` narrow inside their CHECK rather than through
     * `.on(…)`, so their cases have to name a concrete path, and a path the pack invented would fall
     * outside the repo's own convention and prove nothing. Asked for rather than computed: turning a
     * caller's glob into a concrete path is arithmetic that does not belong in a pack. A repo knows
     * one of its own pure files; nothing else does.
     */
    readonly example: string;
    /**
     * Where a pure file's test sits, as a template over the file's own path. Defaults to
     * `{dir}/{name}.test.ts`.
     *
     * `{dir}` is the file's folder and `{name}` its basename without the extension.
     * `pureHasTest` demands it exists and `pureExportsTested` reads it, so a repo whose tests live
     * in `__tests__/` or end in `.spec.ts` states that here rather than turning both rules off.
     */
    readonly sibling?: string;
    /**
     * What a new pure file may be without owing a reason: a test. Defaults to a glob matching any
     * file whose name carries `.test.`, at any depth.
     *
     * It is `newPureFileNeedsReason`'s exemption, and the `example` path with `.test` before its
     * extension is what proves it, so the two are read together.
     */
    readonly tests?: string;
}
/**
 * Functional Core, Imperative Shell (Bernhardt, "Boundaries", SCNA 2012).
 *
 * The one-stop shop for running FCIS in a repo: the model, the rules that hold both sides honest,
 * the tests that prove the pure side, and the gate on growing it.
 *
 * EVERY RULE KEYS OFF ONE IDENTITY CONVENTION — the single way a repo names its pure code — and
 * the pack DEMANDS it rather than guessing: `Convention` is a mandatory typed parameter, so a repo
 * that binds this pack without saying where its pure code lives does not compile.
 *
 * The import FENCE is not here and cannot be: its layers ARE a repo's architecture. What the pack
 * ships is the half that is true everywhere (no shell IMPORTS in pure); the fence lives in the
 * guarded repo's own house pack, where its layers are.
 *
 * @setup A pure home the repo can name in globs, one real pure file to point at, and a coverage
 * recipe — all four parameters. The sibling-test trio reads them, so a repo that cannot say where
 * its pure code lives cannot bind this pack, by design.
 * @adopt Expect the coverage gate and the sibling-test rules to fire on the first commit that
 * touches pure code; both are scoped to the home you named, so the way to narrow them is to narrow
 * that, never to disable the rule.
 */
export declare const fcis: import("@jawache/flow").Pack<{
    /**
     * Without it, the split is a rule with no model behind it: an agent moves a side effect out of a
     * pure file because a guardrail refused it, learns nothing, and puts the next one back.
     */
    fcis: import("@jawache/flow").BreadcrumbSentence<"at" | "on" | "description" | "text", "file-change">;
    noSideEffectsInPure: import("@jawache/flow").GuardrailSentence<"at" | "on" | "ignore" | "check" | "message" | "test" | "description", "commit">;
    noShellInPure: import("@jawache/flow").GuardrailSentence<"at" | "on" | "ignore" | "check" | "message" | "test" | "description", "commit">;
    noThrowInPure: import("@jawache/flow").GuardrailSentence<"at" | "on" | "ignore" | "check" | "message" | "test" | "description", "commit">;
    pureHasTest: import("@jawache/flow").GuardrailSentence<"at" | "on" | "ignore" | "check" | "message" | "test" | "description", "commit">;
    pureExportsTested: import("@jawache/flow").GuardrailSentence<"at" | "on" | "ignore" | "check" | "message" | "test" | "description", "commit">;
    pureCovered: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "commit">;
    newPureFileNeedsReason: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "commit">;
}, Convention>;
