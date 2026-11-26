// packs/work.ts — the flow pack a repo driven by work binds.
//
// Three entries: a breadcrumb that tells every session how a driven repo works, the guardrail that
// refuses the Playwright CLI's `close-all` and `kill-all`, which close every session's browsers, and
// a turn-end guardrail that holds a session's turn when a line from the web started it and no card
// was raised. The daemon enforces none of them; a driven repo turns them on in its own flow.config.ts:
//
//   import { work } from "@jawache/flow-packs/work";
//   export default defineConfig([ …, pack(work) ]);
//
// The guardrails on a command read the parse flow makes of each command line (`ctx.commands`, one
// entry per simple command, nested ones included): a program is compared without its path, a
// `$( )`, a `bash -c` string, an `eval` and a `sudo` are stepped into, and a heredoc body or a
// quoted argument is text, never a command. Needs @jawache/flow 0.4.0 or later.

import { breadcrumb, type Check, command, defineCategory, definePack, guardrail, programName, session, shellCommands, turnEnd } from "@jawache/flow";
import { jsonl, turnStartLine } from "./transcript.ts";

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
interface LogRow {
  readonly kind: string;
  readonly by?: string;
  readonly body?: string;
  readonly session?: string;
}

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

/** A command of the turn that raises a question or moves the issue, as flow parses it: `work issue next` or `work log question`, wherever the line nests it. Its row may not be in the log yet. */
const settlesTheTurn = (line: string): boolean =>
  (shellCommands({ command: line }) ?? []).some(
    (c) => programName(c.program) === "work" && ((c.args[0] === "issue" && c.args[1] === "next") || (c.args[0] === "log" && c.args[1] === "question")),
  );

/**
 * Whether a turn that ends now is held. Pure: the line that started the turn (`null` when no typed
 * line did), the issue's log rows, oldest first, and the commands the turn ran. Held when a line from
 * the web started the turn, the log has no question, no answer any other way and no move since its
 * newest line from the web, and the turn ran neither `work issue next` nor `work log question`.
 */
function turnIsHeld(startLine: string | null, rows: readonly LogRow[], ran: readonly string[]): boolean {
  if (startLine === null || !startLine.startsWith("[web")) return false;
  const web = lastWebLine(rows);
  if (web < 0) return false;
  if (rows.slice(web + 1).some(settles)) return false;
  return !ran.some(settlesTheTurn);
}

/** The conversation id of the issue's session: the `session` of the newest row that has one, when it is shaped like an id. */
function conversationOf(rows: readonly LogRow[]): string | null {
  const id = rows.findLast((row) => typeof row.session === "string")?.session;
  return id !== undefined && /^[0-9A-Za-z-]{8,}$/.test(id) ? id : null;
}

/**
 * The command that prints the conversation's transcript, whichever coding agent wrote it: Claude Code's by project under `CLAUDE_CONFIG_DIR`
 * (`~/.claude` when unset), Codex's by day under `CODEX_HOME` (`~/.codex`). It prints only the rows that can start a turn, a Claude Code row with an
 * `origin` and a Codex `task_started` or message, so a long session stays under flow's 16 MB limit on a command's output. Prints nothing when there is none.
 */
const transcriptCommand = (id: string): string =>
  `{ grep -h '"origin":' "\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/projects/*/${id}.jsonl; grep -hE '"task_started"|"role":"user"' "\${CODEX_HOME:-$HOME/.codex}"/sessions/*/*/*/*${id}.jsonl; } 2>/dev/null`;

/** The main session: an agent that is not a subagent. */
const main = defineCategory("main", (facts) => !facts.subagent);

/**
 * Reads `WORK_SESSION`, the issue's `.work/<id>/log.jsonl`, the session's transcript, found by the
 * conversation id in that log, and the commands the turn ran. A session with no `WORK_SESSION`, an
 * issue with no log and a turn with no transcript to read are handed back.
 */
const webLineWithoutCard: Check = async (ctx) => {
  if (!ctx.actor.includes("main")) return ctx.ok(); // `.for(main)` binds the entry live; a case runs the check alone
  const issue = issueOf((await ctx.exec("printenv WORK_SESSION")).stdout);
  if (issue === null) return ctx.ok();
  const path = `.work/${issue}/log.jsonl`;
  if (!(await ctx.fs.exists(path))) return ctx.ok();
  const rows = jsonl<LogRow>(await ctx.fs.read(path));
  const conversation = conversationOf(rows);
  if (conversation === null) return ctx.ok();
  const startLine = turnStartLine((await ctx.exec(transcriptCommand(conversation))).stdout);
  const ran = (ctx.turn ?? []).flatMap((action) => (action.did === "run" ? [action.command] : []));
  return turnIsHeld(startLine, rows, ran) ? ctx.fail(`issue ${issue}`) : ctx.ok();
};

const CONVERSATION = "00000000-0000-4000-8000-000000000001";

/** A row of the issue's log. */
const logRow = (row: Record<string, unknown>): string => JSON.stringify({ at: "2026-11-25T16:00:00Z", ...row });
const answerByLine = logRow({ kind: "answer", by: "line" });
const sessionRow = JSON.stringify({ at: "2026-11-25T15:00:00Z", kind: "event", body: "Session resumed.", session: CONVERSATION });

/** A Claude Code transcript whose last turn a human typed `line` to start. */
const claudeTranscript = (line: string): string =>
  [{ type: "user", origin: { kind: "human" }, message: { content: line } }, { type: "assistant", message: { content: [{ type: "text", text: "Working." }] } }].map((row) => JSON.stringify(row)).join("\n");

/** A Codex transcript whose last turn a user typed `line` to start. */
const codexTranscript = (line: string): string =>
  [
    { type: "event_msg", payload: { type: "task_started", turn_attribution: { turn_id: "t1", turn_trigger: "user" } } },
    {
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: line }], internal_chat_message_metadata_passthrough: { turn_id: "t1", content_item_metadata: [{ provenance: { type: "user" } }] } },
    },
  ]
    .map((row) => JSON.stringify(row))
    .join("\n");

/** The canned world of a case: the session's issue is `t-1`, its log holds these rows, and its transcript is `transcript`. */
function world(rows: string[], transcript: string | null = claudeTranscript("[web card 3] go")) {
  return {
    exec: {
      "printenv WORK_SESSION": { stdout: "o/r#t-1\n" },
      [transcriptCommand(CONVERSATION)]: { stdout: transcript ?? "" },
    },
    fs: { ".work/t-1/log.jsonl": [sessionRow, ...rows].join("\n") + "\n" },
  };
}

/** A case: the main session hands back, having run these commands. */
const handsBack = (rows: string[], transcript?: string | null, ran: string[] = []) => ({
  actions: ran.map((command) => ({ did: "run" as const, command })),
  actor: ["main"],
  world: world(rows, transcript),
});

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
   * Without it, a session that your line from the web started ends its turn with a word in the
   * terminal, where you are not reading: you sent the line from the web, so the web is where you
   * are. It reads the session's transcript for the line that started the turn, so a turn you start
   * in the terminal, or the daemon starts with a `[work]` line, is handed back however old your last
   * line from the web is. Held once for each turn: flow lets the session's next hand-back through.
   */
  webLineGetsACard: guardrail()
    .at(turnEnd)
    .for(main)
    .check(webLineWithoutCard)
    .message(
      "Your turn is ending after a line from the web with no card raised. The human's last line came from the web, so they are reading the web and not this terminal. What they need to read or decide is a new work log question. With nothing for them to read or decide, hand back again.",
    )
    .description("A main session's turn is held when a line from the web started it, read from the session's transcript, and the session has raised no question, no question has been answered any other way, the issue has not moved and the turn ran neither `work issue next` nor `work log question`.")
    .test({
      block: [
        // the page's examples: a line from the web started the turn, and the log ends with it, or with an fyi after it
        handsBack([answerByLine]),
        handsBack([logRow({ kind: "note" })], claudeTranscript("[web] a message")),
        handsBack([answerByLine, logRow({ kind: "fyi" })]),
        // a hold's message in the transcript does not change the line that started the turn
        handsBack([answerByLine], claudeTranscript("[web card 3] go") + "\n" + JSON.stringify({ type: "user", isMeta: true, message: { content: "Stop hook feedback: held" } })),
        // each coding agent's format
        handsBack([answerByLine], codexTranscript("[web card 3] go")),
        // a command that only names the two does not settle the turn: a heredoc body, a commit message, a search
        handsBack([answerByLine], undefined, ["work log fyi --on 1 <<'WORKLOG'\nwork issue next moves it.\nWORKLOG"]),
        handsBack([answerByLine], undefined, ["git commit -m 'docs; work issue next moves it'"]),
        handsBack([answerByLine], undefined, ["grep -rn 'work issue next' docs", "work log fyi --on 1 <<'WORKLOG'\nThe rule reads work log question.\nWORKLOG"]),
      ],
      pass: [
        // the page's examples: the session raised a card, moved the issue, or the question was answered another way
        handsBack([answerByLine, logRow({ kind: "question" })]),
        handsBack([answerByLine, logRow({ kind: "event", body: "Moved to Docs." })]),
        handsBack([answerByLine, logRow({ kind: "answer", by: "session" })]),
        // the page's examples: a line typed in the terminal, and a `[work]` line, started the turn
        handsBack([answerByLine], claudeTranscript("Let me ask a question. Does it work?")),
        handsBack([answerByLine], claudeTranscript("[work] /work plan work-3")),
        handsBack([answerByLine], codexTranscript("Let me ask a question. Does it work?")),
        handsBack([answerByLine], codexTranscript("[work] /work plan work-3")),
        // the turn ran the command whose row is not in the log yet
        handsBack([answerByLine], undefined, ["work issue next t-1"]),
        handsBack([answerByLine], undefined, ["work log question --ask \"Which?\" <<'WORKLOG'\nA body.\nWORKLOG"]),
        handsBack([answerByLine], undefined, ["just test && work issue next t-1"]),
        handsBack([answerByLine], undefined, ["/usr/local/bin/work issue next t-1"]),
        handsBack([answerByLine], undefined, ["bash -c 'work log question --ask x'"]),
        // a session id that is not an id is never put in a command
        { actions: [], actor: ["main"], world: { ...world([answerByLine]), fs: { ".work/t-1/log.jsonl": JSON.stringify({ at: "2026-11-25T15:00:00Z", kind: "event", session: "x; touch pwned" }) + "\n" + answerByLine + "\n" } } },
        // no transcript to read, and a log with no conversation to find one by
        handsBack([answerByLine], null),
        { actions: [], actor: ["main"], world: { ...world([answerByLine]), fs: { ".work/t-1/log.jsonl": answerByLine + "\n" } } },
        // a log with no line from the web
        handsBack([logRow({ kind: "question" })]),
        // a torn last line of the log is skipped, not thrown on
        handsBack([answerByLine, logRow({ kind: "question" }), '{"at":"2026-11-25T16:02:00Z","kind":"fy']),
        // a subagent's hand-back is never held
        { ...handsBack([answerByLine]), actor: ["subagent"] },
        // no WORK_SESSION, and an issue with no log
        { actions: [], actor: ["main"], world: { exec: { "printenv WORK_SESSION": { stdout: "" } } } },
        { actions: [], actor: ["main"], world: { exec: { "printenv WORK_SESSION": { stdout: "o/r#t-1\n" } } } },
      ],
    }),
});
