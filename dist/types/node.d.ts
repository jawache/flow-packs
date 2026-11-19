/**
 * The dependency names whose entry differs between two package.json texts.
 *
 * Unparseable JSON on either side names every dependency both sides mention: a file being reshaped
 * into something else is a change we cannot rule out. An empty string means the file did not exist
 * on that side.
 */
export declare function movedDependencies(beforeText: string, afterText: string): string[];
/**
 * package.json discipline: reach for a maintained package, say why, pin it, move the lockfile with
 * it.
 *
 * The dependencies breadcrumb's POLARITY is deliberate. It does not read as "adding a dependency is
 * a risk"; it reads as "check whether it is already solved" — because the code we hand-roll to
 * avoid a package has no users, no reviewers and no fixes coming, which is the larger risk most of
 * the time.
 *
 * @setup A lockfile the repo commits — `package-lock.json`, `pnpm-lock.yaml`, `bun.lock`,
 * `bun.lockb` or `yarn.lock`; `lockfileInStep` recognises all five and asks for whichever one the
 * repo already has.
 */
export declare const node: import("@jawache/flow").Pack<{
    /**
     * Without it, the reflex is to hand-roll rather than to look, and a repo accumulates private
     * versions of solved problems — code with no users, no reviewers and no fixes coming.
     */
    dependencies: import("@jawache/flow").BreadcrumbSentence<"at" | "on" | "description" | "text", "file-change">;
    /**
     * Without it, a dependency arrives with no record of what else was considered, and the next
     * person to ask "why do we depend on this" has only the package name to go on.
     */
    newDependencyNeedsReason: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "commit">;
    /**
     * Without it, a dependency moves in one commit and the lockfile in another (or never), so a
     * fresh clone installs something nobody tested and the two files disagree about what this repo
     * depends on.
     */
    lockfileInStep: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "commit">;
}, undefined>;
