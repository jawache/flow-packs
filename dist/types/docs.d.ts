/** The two facts about a repo's docs folder the pack cannot know: where it is, and what may sit loose in it. */
export interface Doors {
    /**
     * The documentation folder, as a path from the repo root. Defaults to `docs`.
     *
     * Its guardrail and both breadcrumbs are scoped to it, so a repo whose pages live in
     * `documentation/` names that here and keeps every rule.
     */
    readonly root?: string;
    /**
     * Filenames allowed to sit LOOSE at the top of that folder, beside the two doors. Defaults to
     * none — every file belongs behind `user/` or `agent/`.
     *
     * A repo that keeps a `README.md` at the top of its docs folder names it here.
     */
    readonly allow?: readonly string[];
}
/**
 * Two documentation audiences, one folder, nothing replicated.
 *
 * Every repo documents for exactly two readers who want opposite things: the end user wants the
 * least possible cognitive load, and the agent wants almost nothing in context. So `docs/` has
 * exactly two doors and everything inside follows its door's rules.
 *
 * @setup A `docs/` folder holding exactly `user/` and `agent/`, each with its own index — an index
 * file under `docs/user/` for people and `docs/agent/README.md` as a list of pointers. The user
 * pages are markdown, and each one is one of the four kinds of the Diátaxis method
 * (https://diataxis.fr): a tutorial, a how-to guide, a reference or an explanation, in the folder
 * its kind names, `tutorials/`, `how-to/`, `reference/` or `explanation/`. The breadcrumbs say so as
 * guidance and refuse nothing. The guardrail below refuses anything else at the top of the folder, so a repo
 * with a different shape either moves its pages or does not bind this pack.
 */
export declare const docs: import("@jawache/flow").Pack<{
    /**
     * Without it, an agent writing under `docs/` has no way to know there are two audiences. User
     * pages fill with rationale nobody asked for, and agent pages fill with copies of what the code
     * already says, which go stale silently while still reading as true.
     */
    docs: import("@jawache/flow").BreadcrumbSentence<"at" | "on" | "description" | "text", "file-change">;
    /**
     * Without it, every user page is written in whatever style that session had, and the docs read
     * as ten authors. Its rules are the writing rules of the work skill, with nothing in them that is
     * one repo's taste.
     */
    userDocsStyle: import("@jawache/flow").BreadcrumbSentence<"at" | "on" | "description" | "text", "file-change">;
    /**
     * Without it, `docs/` grows a third folder nobody chose — notes, scratch, drafts — and the two
     * doors stop being a rule. A folder with no declared audience is how a docs folder becomes a
     * drawer, and neither audience's rules can be applied to what is in it.
     */
    docsShape: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
}, Doors | undefined>;
