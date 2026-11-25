/**
 * Recipes with no `[doc(…)]` attribute, as `{ name, line }` (1-based).
 *
 * `[private]` recipes are SKIPPED, and that is a fix rather than a nicety: `just --list` hides
 * them, so a private recipe is not in the catalogue and cannot owe the catalogue a description.
 * The message has claimed this exemption from the day it was written and the walk never honoured
 * it — a rule that refuses what its own sentence promises to allow is the worst kind, because the
 * reader does the thing they were told to do and is refused anyway.
 */
export declare function undocumentedRecipes(text: string, exempt?: readonly string[]): {
    name: string;
    line: number;
}[];
export interface Catalogue {
    /**
     * Recipe names that owe no `[doc("…")]`. Usually empty, and MANDATORY so that it is empty on
     * the record rather than by default — an exemption list nobody stated is one nobody reviews.
     *
     * A parameter rather than an override, because `exempt` is the CHECK's option and an override
     * speaks only the sentence keys (at · for · on · ignore · message · disabled).
     *
     * `[private]` recipes need no entry — `just --list` hides them, so the check skips them.
     */
    readonly exempt: readonly string[];
    /** The folder holding the code behind the recipes. Defaults to `tools`. */
    readonly tools?: string;
    /**
     * Commands this repo has a recipe for, as a map from the command, in words, to the recipe that
     * replaces it — `{ "npm run build": "just build" }`.
     *
     * OPTIONAL, and with no map there is no entry at all: which raw command a repo has wrapped is a
     * fact only that repo has, and a rule with an empty list would be one more armed entry matching
     * nothing. Each key is a command as `banCommands` names one: a program and its arguments, so
     * `"npx vitest"` refuses `npx vitest run` and `npx --yes vitest`, and passes `npx vitest-preview`.
     *
     * The catalogue's whole promise is that the recipe is the thing to reach for; a breadcrumb says
     * so once a session, and this refuses the raw command by name for the ones that matter.
     */
    readonly recipes?: Readonly<Record<string, string>>;
}
/**
 * The justfile is the repo's TOOL CATALOGUE.
 *
 * The frame: the justfile plays the role MCP tools play elsewhere — the discovery surface an agent
 * can reach for with confidence. `just --list` is the manifest and each `[doc]` string is a tool
 * description. Every entry here is the same arrow pointing at it: the orientation says look here
 * first, `node/noPackageScripts` closes the decoy surface agents habitually read, and `justfileDocs`
 * keeps the manifest readable.
 *
 * @install `just` itself — `brew install just`, or see https://just.systems. Every rule here reads
 * a `justfile` at the repo root and none of them shells out, so nothing else is needed.
 * @setup A `justfile` at the root whose every non-private recipe carries a `[doc("…")]`, and a
 * `package.json` whose `scripts` block holds nothing but `//`-prefixed comment keys. A repo with
 * live npm scripts moves them into recipes first, or does not bind this pack.
 */
export declare const justfile: import("@jawache/flow").Pack<{
    useTheRecipe?: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "command">;
    /**
     * Without it, an agent discovers commands from package.json, from memory, or from a README that
     * has drifted — and reaches for a tool this repo does not have, or hand-runs the chain a recipe
     * already spells correctly.
     */
    orientation: import("@jawache/flow").BreadcrumbSentence<"at" | "description" | "text", "session">;
    /**
     * Without it, everything in the tools folder is treated the same way: one-shots get promoted
     * into the catalogue until `just --list` is noise, or a genuinely repeatable tool is left with
     * no recipe pointing at it and nobody finds it again.
     */
    toolsHome: import("@jawache/flow").BreadcrumbSentence<"at" | "on" | "description" | "text", "file-change">;
    node: {
        /**
         * Without it, package.json grows a second command surface — the one an agent reads FIRST, out
         * of habit — and the two drift until the catalogue is no longer the truth about this repo.
         */
        noPackageScripts: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
    };
    /**
     * Without it, `just --list` falls back to the last comment line above a recipe, which for a
     * multi-line comment block is a mid-sentence fragment — a help screen assembled by accident, and
     * a tool nobody can choose from its description.
     */
    justfileDocs: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
}, Catalogue>;
