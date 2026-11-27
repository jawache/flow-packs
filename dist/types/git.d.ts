import { type Ctx } from "@jawache/flow";
/**
 * Each way a command line writes a commit or a ref the commit gate never runs on, or [] when it
 * writes none: `git commit --no-verify` or `-n`, `-c core.hooksPath=…` before any subcommand, and
 * git's plumbing that writes commits and refs directly (`commit-tree`, `update-ref`,
 * `hash-object -w`). The git commands are read from the parse, so a `git commit -n` inside a quoted
 * argument or a heredoc body is not one.
 */
export declare function gateSkips(facts: Pick<Ctx, "command" | "commands">): string[];
/**
 * A release commit's header — the ONE shape allowed to write a version by hand.
 *
 * `release: …` · `release(scope): …` · `release(scope)!: …` · `chore(release): …`, and a `chore`
 * ONLY with a release-ish scope.
 *
 * `chore` REQUIRES its release scope: a bare `chore:` licensing a hand-edited version is the one
 * thing this rule exists to refuse. A `release(scope)` scope is free text — the word "release" is
 * not demanded inside the parentheses, so `release(cli): 1.0.0` passes.
 */
export declare function isReleaseCommit(message: string): boolean;
/**
 * Does this diff change the version VALUE?
 *
 * Values on both sides, compared — never "an added line mentions version". Adding a key after the
 * version rewrites its line (it gains a comma), and a rule that fired on every reformat is a rule
 * whose message people stop reading.
 */
export declare function changesVersion(diff: string): boolean;
/** What this pack cannot know: which recipe cuts a release, and which file carries the version. */
export interface Release {
    /**
     * The file the release writes the version into. Defaults to `package.json`.
     *
     * `noHandEditedVersion` reads whatever this names out of the commit's own diff, so any manifest
     * works there. `versionIsSemver` reads it as JSON, so a repo whose manifest is TOML or YAML names
     * the file here and disables that one entry.
     */
    readonly versionFile?: string;
    /**
     * The type words a commit header may use. Defaults to the eleven of Conventional Commits plus
     * `release`: feat · fix · docs · style · refactor · perf · test · build · ci · chore · revert ·
     * release.
     *
     * A repo with its own vocabulary states the WHOLE list, never an addition — the refusal prints
     * what it was given, so a half-list would refuse a type it then failed to mention.
     */
    readonly types?: readonly string[];
    /**
     * The recipe that computes the version from the history, writes the changelog, stamps the
     * version file and tags — for example `just release` or `npm run release`.
     *
     * MANDATORY rather than defaulted, by the same rule tdd's suite recipe follows: a default is a
     * rule that names the wrong command in every repo that spells it differently, and it names it in
     * the one sentence a person reads at the moment they are blocked.
     */
    readonly release: string;
}
/**
 * Conventional commit headers, computed versions, and nothing destroys uncommitted work.
 *
 * The `node/` sub-group is release discipline spelled in package.json, and package.json only.
 *
 * @setup A release path the repo really has, named as the `release` parameter: the recipe that
 * computes the next version from the commit headers, writes the changelog and tags. The version
 * rules refuse a hand-edited version in favour of it, so a repo without one has nowhere to send a
 * blocked reader.
 * @adopt Bind it in a repo that already writes conventional commits, or expect the header rule to
 * refuse the first few commits while everyone re-learns the format — that is the rule working, and
 * `flow status` will show it firing.
 */
export declare const git: import("@jawache/flow").Pack<{
    /**
     * Without it, the commit surface is learned by trial and refusal: an agent writes a header the
     * changelog cannot read, reaches for a force push, or discards uncommitted work with a command
     * that has no undo.
     */
    orientation: import("@jawache/flow").BreadcrumbSentence<"at" | "description" | "text", "session">;
    /**
     * Claude Code tells every agent to end a commit or a pull request with a line crediting Claude,
     * and an agent follows the harness's instruction over the repo's. Without this, the credit lands
     * in history, where removing it means rewriting commits that may already be shared.
     */
    noAiAttributionInCommits: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "commit">;
    noForcePush: import("@jawache/flow").GuardrailSentence<"at" | "everywhere" | "check" | "message" | "test" | "description", "command">;
    /**
     * A session runs with no permission prompts and under the person's own GitHub login, so nothing
     * else stands between it and a `gh` command that deletes something for good. A deletion that is
     * wanted is one the person runs themselves.
     */
    noDestructiveGh: import("@jawache/flow").GuardrailSentence<"at" | "everywhere" | "check" | "message" | "test" | "description", "command">;
    /**
     * The commit gate is a hook, and git has ways to commit without running it. A commit made that
     * way holds content no rule judged.
     */
    noGateSkip: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "command">;
    conventionalCommitFormat: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "commit">;
    node: {
        versionIsSemver: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
        noHandEditedVersion: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "commit">;
    };
}, Release>;
