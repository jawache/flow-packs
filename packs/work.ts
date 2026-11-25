// packs/work.ts — the flow pack a repo driven by work binds.
//
// Three entries: a breadcrumb that tells every session how a driven repo works, the guardrail that
// refuses the Playwright CLI's `close-all` and `kill-all`, which close every session's browsers, and
// a turn-end guardrail that holds a session's turn once when the human's last line came from the web
// and no card was raised. The daemon enforces none of them; a driven repo turns them on in its own flow.config.ts:
//
//   import { work } from "@jawache/flow-packs/work";
//   export default defineConfig([ …, pack(work) ]);
//
// The guardrails on a command read the parse flow makes of each command line (`ctx.commands`, one
// entry per simple command, nested ones included): a program is compared without its path, a
// `$( )`, a `bash -c` string, an `eval` and a `sudo` are stepped into, and a heredoc body or a
// quoted argument is text, never a command. Needs @jawache/flow 0.4.0 or later.

import { breadcrumb, type Check, command, defineCategory, definePack, guardrail, programName, session, shellCommands, turnEnd } from "@jawache/flow";

// ── what no session may run ──

/** The Playwright CLI's two verbs that act on every session's browsers, wherever it is run from. */
const PLAYWRIGHT_ALL = new Set(["close-all", "kill-all"]);
/** A word that names the Playwright CLI as an argument of any program, npx and its kin among them: `@playwright/cli`, `playwright-cli`, either with a version. */
const PLAYWRIGHT_CLI_WORD = /^(?:@playwright\/cli|playwright-cli)(?:@.*)?$/;

/**
 * A command that runs the Playwright CLI's `close-all` or `kill-all`: the CLI is the program, an
 * argument of npx and its kin, or a variable the line expands as the program (`$PC close-all`, as
 * work-45 typed it). Only the parse's own words are read, so a search for the verb, a commit message
 * and a heredoc body that name it run nothing.
 */
const playwrightAll: Check = (ctx) => {
  const commands = shellCommands(ctx);
  if (commands === null) return ctx.ok(); // flow's convention: a line it cannot parse is not judged
  const found = commands.find(
    (c) =>
      c.args.some((a) => PLAYWRIGHT_ALL.has(a)) &&
      (programName(c.program) === "playwright-cli" || c.program.startsWith("$") || c.args.some((a) => PLAYWRIGHT_CLI_WORD.test(a))),
  );
  return found === undefined ? ctx.ok() : ctx.fail(found.text);
};

// ── a line from the web with no card ──

/** One row of an issue's `log.jsonl`, as far as the rule reads it. */
export interface LogRow {
  readonly at: string;
  readonly kind: string;
  readonly by?: string;
  readonly body?: string;
}

/** This rule's id in flow's own log. */
const WEB_LINE_RULE = "work.webLineGetsACard";

/** The detail a hold records, so a later turn can tell which issue it was made for. */
const holdDetail = (issue: string): string => `issue ${issue}`;

/** The issue's id in `WORK_SESSION`, which holds `<owner>/<repo>#<issue>`; `null` when there is none. */
function issueOf(session: string): string | null {
  const id = session.trim().split("#")[1];
  return id === undefined || id === "" ? null : id;
}

/** The newest row of the log that is a line from the web: an `answer` with `by: line`, or a `note`. */
const lastWebLine = (rows: readonly LogRow[]): number => rows.findLastIndex((row) => row.kind === "note" || (row.kind === "answer" && row.by === "line"));

/** A row that settles a web line: a question raised, an answer from anywhere else, or a move of the issue. */
const settles = (row: LogRow): boolean =>
  row.kind === "question" || row.kind === "answer" || (row.kind === "event" && /^Moved to /.test(row.body ?? ""));

/**
 * Whether a turn that ends now is held. Pure: the issue's log rows, oldest first, and the times of
 * this rule's earlier holds for this issue. Held when the newest line from the web has no question,
 * answer or move after it and no hold of this rule at or after it. Times are compared as times,
 * because the daemon stamps whole seconds and flow stamps milliseconds.
 */
export function turnIsHeld(rows: readonly LogRow[], holds: readonly string[]): boolean {
  const web = lastWebLine(rows);
  if (web < 0) return false;
  if (rows.slice(web + 1).some(settles)) return false;
  const since = Date.parse(rows[web]?.at ?? "");
  return !holds.some((hold) => Date.parse(hold) >= since);
}

/** The rows of a JSONL text: blank lines dropped, a line that does not parse (a torn one) skipped. */
function jsonl<T>(text: string): T[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

/** The times of this rule's holds for one issue, from the lines of flow's own log. */
const holdTimes = (flowLog: string, issue: string): string[] =>
  jsonl<{ ts?: string; id?: string; kind?: string; detail?: string }>(flowLog).flatMap((row) =>
    row.kind === "guardrail" && row.id === WEB_LINE_RULE && row.detail === holdDetail(issue) && row.ts !== undefined ? [row.ts] : [],
  );

/** The main session: an agent that is not a subagent. */
const main = defineCategory("main", (facts) => !facts.subagent);

/**
 * Reads `WORK_SESSION`, the issue's `.work/<id>/log.jsonl`, and flow's own log for this rule's earlier
 * holds. A session with no `WORK_SESSION`, or an issue with no log, is handed back.
 */
const webLineWithoutCard: Check = async (ctx) => {
  if (!ctx.actor.includes("main")) return ctx.ok(); // `.for(main)` binds the entry live; a case runs the check alone
  const issue = issueOf((await ctx.exec("printenv WORK_SESSION")).stdout);
  if (issue === null) return ctx.ok();
  const path = `.work/${issue}/log.jsonl`;
  if (!(await ctx.fs.exists(path))) return ctx.ok();
  const rows = jsonl<LogRow>(await ctx.fs.read(path));
  if (!turnIsHeld(rows, [])) return ctx.ok(); // nothing to hold for: skip the read of flow's log
  const flowLog = (await ctx.exec(`grep -h '"id":"${WEB_LINE_RULE}"' .flow/log/*.jsonl`)).stdout;
  return turnIsHeld(rows, holdTimes(flowLog, issue)) ? ctx.fail(holdDetail(issue)) : ctx.ok();
};


/** The canned world of a case: the session's issue is `t-1`, its log holds these rows, flow's log these lines. */
function world(rows: string[], flowLog: string[] = []) {
  return {
    exec: {
      "printenv WORK_SESSION": { stdout: "o/r#t-1\n" },
      [`grep -h '"id":"${WEB_LINE_RULE}"' .flow/log/*.jsonl`]: { stdout: flowLog.join("\n") },
    },
    fs: { ".work/t-1/log.jsonl": rows.join("\n") + "\n" },
  };
}

/** A line of flow's log: this rule held a turn for an issue at a time. */
const hold = (ts: string, issue: string): string => JSON.stringify({ ts, kind: "guardrail", id: WEB_LINE_RULE, detail: holdDetail(issue) });

/**
 * A repo driven by work: the daemon types `[work]` lines into one session of the repo's coding agent, Claude Code or Codex, per issue,
 * and the session tells the human with `work log`.
 *
 * @setup `work` on the PATH (it provides `work log`), and a `work.yml` at the repo root.
 */
export const work = definePack("work", {
  /**
   * Without it, a session in a driven repo reads `[work]` lines as a stranger's chatter, and
   * answers in the terminal where nobody is reading.
   */
  orientation: breadcrumb()
    .at(session)
    .text(
      [
        "This repo is driven by work. Each issue is a folder in the record, `.work/<id>/`, with one session of the repo's coding agent, Claude Code or Codex, in its own worktree; the work daemon types lines starting with `[work]` into it. `[work] /work <verb> <issue>` is the issue entering a status: invoke the `work` skill, which dispatches the verb. Any other `[work]` line relays the daemon, such as a merge of the issue's branch.",
        "The record is `.work/<id>/`: `issue.md`, `tasks/`, `log.jsonl` and `artifacts/`. Git ignores it, so what you write there is saved as written and never committed. You edit `issue.md` and the tasks as Markdown, and the daemon checks each change of `issue.md` and types what is wrong into its session; a move is `work issue next <id>`, which writes the `status:` line, and only where the skill says. Only the daemon writes `log.jsonl`: ask the human with `work log question --ask \"…\"` and its body on stdin as a quoted heredoc, then stop; tell them with `work log fyi`. Never record a session's state in the record.",
        "Print every link as a Markdown link, so the terminal opens it: `[tasks/3.md](http://localhost:4242/work-3/3)`, the port being 4242 unless `web:` in `~/.work/config.yml` says otherwise.",
        "`.work/` links out of the repo. Run Node code there with `NODE_OPTIONS=\"--preserve-symlinks --preserve-symlinks-main\"`, or it cannot find the repo's packages. Call the tool by `node_modules/.bin/<tool>`: that setting breaks `npx`.",
      ].join("\n"),
    )
    .description("How a repo driven by work works: [work] lines, the work skill, the record in .work, work log."),

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
  playwrightClosesOwnBrowser: guardrail()
    .at(command)
    .check(playwrightAll)
    .message(
      "`close-all` and `kill-all` of the Playwright CLI close every session's browsers on this machine, other issues' demos among them, whatever folder you type them in. Close your own browser by the name you opened it with: `npx -y @playwright/cli -s=<name> close`, `<name>` being the `-s=` you passed to `open`. `list --all` shows which are open.",
    )
    .description("The Playwright CLI's `close-all` and `kill-all`, which close every session's browsers, are refused in every session at any status; a close by name, `-s=<name> close`, runs.")
    .test({
      block: [
        "npx -y @playwright/cli close-all",
        "npx -y @playwright/cli kill-all",
        "npx @playwright/cli close-all >/dev/null 2>&1",
        "cd /tmp/scratch && npx @playwright/cli close-all >/dev/null 2>&1",
        "playwright-cli close-all",
        'PC="npx -y @playwright/cli@latest"; $PC close-all',
        "npx -y @playwright/cli@latest kill-all",
      ].map((command) => ({ command })),
      pass: [
        "npx -y @playwright/cli -s=app-42 close",
        "npx -y @playwright/cli list --all",
        "grep -rn close-all docs",
        "git commit -m 'docs: the guard refuses close-all and kill-all'",
        "work log fyi --on 1 <<'WORKLOG'\nThe rule refuses close-all and kill-all.\nWORKLOG",
      ].map((command) => ({ command })),
    }),

  /**
   * Without it, a session that your line from the web reached ends its turn with a word in the
   * terminal, where you are not reading: you sent the line from the web, so the web is where you
   * are. Held once for each line, so a session with nothing for you to read or decide hands back
   * again and is let through.
   */
  webLineGetsACard: guardrail()
    .at(turnEnd)
    .for(main)
    .check(webLineWithoutCard)
    .message(
      "Your turn is ending after a line from the web with no card raised. The human's last line came from the web, so they are reading the web and not this terminal. What they need to read or decide is a new work log question. With nothing for them to read or decide, hand back again.",
    )
    .description("A main session's turn is held once when the human's last line to it came from the web and it has raised no question, no question has been answered any other way and the issue has not moved since.")
    .test({
      block: [
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}']) },
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"note"}']) },
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}', '{"at":"2026-11-25T16:01:00Z","kind":"fyi"}']) },
        // a hold for another issue, or one made before the line, does not count
        {
          actions: [],
          actor: ["main"],
          world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}'], [hold("2026-11-25T16:05:00.000Z", "other-1"), hold("2026-11-25T15:00:00.000Z", "t-1")]),
        },
        // a hold made before a newer line from the web does not count
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}', '{"at":"2026-11-25T16:10:00Z","kind":"note"}'], [hold("2026-11-25T16:00:30.000Z", "t-1")]) },
      ],
      pass: [
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}', '{"at":"2026-11-25T16:01:00Z","kind":"question"}']) },
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}', '{"at":"2026-11-25T16:01:00Z","kind":"event","body":"Moved to Docs."}']) },
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}'], [hold("2026-11-25T16:00:00.940Z", "t-1")]) },
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"question"}']) },
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}', '{"at":"2026-11-25T16:01:00Z","kind":"answer","by":"session"}']) },
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"note"}', '{"at":"2026-11-25T16:01:00Z","kind":"question"}']) },
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"note"}', '{"at":"2026-11-25T16:01:00Z","kind":"event","body":"Moved to Docs."}']) },
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"note"}'], [hold("2026-11-25T16:00:00.940Z", "t-1")]) },
        // a torn last line of the log is skipped, not thrown on
        { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}', '{"at":"2026-11-25T16:01:00Z","kind":"question"}', '{"at":"2026-11-25T16:02:00Z","kind":"fy']) },
        // a subagent's hand-back is never held
        { actions: [], actor: ["subagent"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}']) },
        // no WORK_SESSION, and an issue with no log
        { actions: [], actor: ["main"], world: { exec: { "printenv WORK_SESSION": { stdout: "" } } } },
        { actions: [], actor: ["main"], world: { exec: { "printenv WORK_SESSION": { stdout: "o/r#t-1\n" } } } },
      ],
    }),
});
