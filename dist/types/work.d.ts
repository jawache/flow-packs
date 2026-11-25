/** One row of an issue's `log.jsonl`, as far as the rule reads it. */
export interface LogRow {
    readonly at: string;
    readonly kind: string;
    readonly by?: string;
    readonly body?: string;
}
/**
 * Whether a turn that ends now is held. Pure: the issue's log rows, oldest first, and the times of
 * this rule's earlier holds for this issue. Held when the newest line from the web has no question,
 * answer or move after it and no hold of this rule at or after it. Times are compared as times,
 * because the daemon stamps whole seconds and flow stamps milliseconds.
 */
export declare function turnIsHeld(rows: readonly LogRow[], holds: readonly string[]): boolean;
/**
 * A repo driven by work: the daemon types `[work]` lines into one session of the repo's coding agent, Claude Code or Codex, per issue,
 * and the session tells the human with `work log`.
 *
 * @setup `work` on the PATH (it provides `work log`), and a `work.yml` at the repo root.
 */
export declare const work: import("@jawache/flow").Pack<{
    /**
     * Without it, a session in a driven repo reads `[work]` lines as a stranger's chatter, and
     * answers in the terminal where nobody is reading.
     */
    orientation: import("@jawache/flow").BreadcrumbSentence<"at" | "description" | "text", "session">;
    /**
     * Without it, a session that ends its demo with the Playwright CLI's `close-all` closes the browser
     * of every other session on the machine, whatever folder it types it in: the CLI keeps one registry
     * of open browsers for the user, and work-86's first `close-all` run closed the browser
     * work-95's session was measuring memory with. `kill-all` does the same, by force. A session closes its own browser by
     * the name it opened it with, `-s=<name> close`.
     *
     * The entry is a command that runs either verb through the CLI, named as `@playwright/cli`,
     * `playwright-cli` or a variable the line expands. Any status, any folder.
     */
    playwrightClosesOwnBrowser: import("@jawache/flow").GuardrailSentence<"at" | "check" | "message" | "test" | "description", "command">;
    /**
     * Without it, a session that your line from the web reached ends its turn with a word in the
     * terminal, where you are not reading: you sent the line from the web, so the web is where you
     * are. Held once for each line, so a session with nothing for you to read or decide hands back
     * again and is let through.
     */
    webLineGetsACard: import("@jawache/flow").GuardrailSentence<"at" | "for" | "check" | "message" | "test" | "description", "turn-end">;
}, undefined>;
