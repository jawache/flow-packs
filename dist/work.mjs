// packs/work.ts
import { breadcrumb, command, defineCategory, definePack, guardrail, programName, session, shellCommands, turnEnd } from "@jawache/flow";

// packs/transcript.ts
function jsonl(text) {
  return text.split("\n").filter((line) => line.trim() !== "").flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}
var isRow = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var asRow = (value) => isRow(value) ? value : {};
function textOf(content, keep = () => true) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const texts = content.flatMap((block, index) => {
    const b = asRow(block);
    return keep(index) && (b.type === "text" || b.type === "input_text") && typeof b.text === "string" ? [b.text] : [];
  });
  return texts.length === 0 ? null : texts.join("\n");
}
function claudeLine(rows) {
  const start = rows.findLast((row) => row.type === "user" && row.isSidechain !== true && isRow(row.origin));
  if (start === void 0 || asRow(start.origin).kind !== "human") return null;
  return textOf(asRow(start.message).content);
}
function codexLine(rows) {
  const started = rows.findLastIndex((row) => asRow(row.payload).type === "task_started");
  if (started < 0) return null;
  const attribution = asRow(asRow(rows[started]?.payload).turn_attribution);
  if (attribution.turn_trigger !== "user" || typeof attribution.turn_id !== "string") return null;
  for (const row of rows.slice(started + 1)) {
    const payload = asRow(row.payload);
    if (payload.type !== "message" || payload.role !== "user") continue;
    const meta = asRow(payload.internal_chat_message_metadata_passthrough);
    if (meta.turn_id !== attribution.turn_id) continue;
    const items = Array.isArray(meta.content_item_metadata) ? meta.content_item_metadata : [];
    const typed = (index) => asRow(asRow(items[index]).provenance).type === "user";
    const line = textOf(payload.content, typed);
    if (line !== null) return line;
  }
  return null;
}
var isCodex = (rows) => rows.some((row) => row.type === "session_meta" || row.type === "event_msg" || row.type === "response_item");
function turnStartLine(transcript) {
  const rows = jsonl(transcript).filter(isRow);
  return isCodex(rows) ? codexLine(rows) : claudeLine(rows);
}

// packs/work.ts
var PLAYWRIGHT_ALL = /* @__PURE__ */ new Set(["close-all", "kill-all"]);
var PLAYWRIGHT_CLI_WORD = /^(?:@playwright\/cli|playwright-cli)(?:@.*)?$/;
var playwrightAll = (ctx) => {
  const commands = shellCommands(ctx);
  if (commands === null) return ctx.ok();
  const found = commands.find(
    (c) => c.args.some((a) => PLAYWRIGHT_ALL.has(a)) && (programName(c.program) === "playwright-cli" || c.program.startsWith("$") || c.args.some((a) => PLAYWRIGHT_CLI_WORD.test(a)))
  );
  return found === void 0 ? ctx.ok() : ctx.fail(found.text);
};
function issueOf(session2) {
  const id = session2.trim().split("#")[1];
  return id === void 0 || id === "" ? null : id;
}
var lastWebLine = (rows) => rows.findLastIndex((row) => row.kind === "note" || row.kind === "answer" && row.by === "line");
var settles = (row) => row.kind === "question" || row.kind === "answer" || row.kind === "event" && /^Moved to /.test(row.body ?? "");
var settlesTheTurn = (line) => (shellCommands({ command: line }) ?? []).some(
  (c) => programName(c.program) === "work" && (c.args[0] === "issue" && c.args[1] === "next" || c.args[0] === "log" && c.args[1] === "question")
);
function turnIsHeld(startLine, rows, ran) {
  if (startLine === null || !startLine.startsWith("[web")) return false;
  const web = lastWebLine(rows);
  if (web < 0) return false;
  if (rows.slice(web + 1).some(settles)) return false;
  return !ran.some(settlesTheTurn);
}
function conversationOf(rows) {
  const id = rows.findLast((row) => typeof row.session === "string")?.session;
  return id !== void 0 && /^[0-9A-Za-z-]{8,}$/.test(id) ? id : null;
}
var transcriptCommand = (id) => `{ grep -h '"origin":' "\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/projects/*/${id}.jsonl; grep -hE '"task_started"|"role":"user"' "\${CODEX_HOME:-$HOME/.codex}"/sessions/*/*/*/*${id}.jsonl; } 2>/dev/null`;
var main = defineCategory("main", (facts) => !facts.subagent);
var webLineWithoutCard = async (ctx) => {
  if (!ctx.actor.includes("main")) return ctx.ok();
  const issue = issueOf((await ctx.exec("printenv WORK_SESSION")).stdout);
  if (issue === null) return ctx.ok();
  const path = `.work/${issue}/log.jsonl`;
  if (!await ctx.fs.exists(path)) return ctx.ok();
  const rows = jsonl(await ctx.fs.read(path));
  const conversation = conversationOf(rows);
  if (conversation === null) return ctx.ok();
  const startLine = turnStartLine((await ctx.exec(transcriptCommand(conversation))).stdout);
  const ran = (ctx.turn ?? []).flatMap((action) => action.did === "run" ? [action.command] : []);
  return turnIsHeld(startLine, rows, ran) ? ctx.fail(`issue ${issue}`) : ctx.ok();
};
var CONVERSATION = "00000000-0000-4000-8000-000000000001";
var logRow = (row) => JSON.stringify({ at: "2026-11-25T16:00:00Z", ...row });
var answerByLine = logRow({ kind: "answer", by: "line" });
var sessionRow = JSON.stringify({ at: "2026-11-25T15:00:00Z", kind: "event", body: "Session resumed.", session: CONVERSATION });
var claudeTranscript = (line) => [{ type: "user", origin: { kind: "human" }, message: { content: line } }, { type: "assistant", message: { content: [{ type: "text", text: "Working." }] } }].map((row) => JSON.stringify(row)).join("\n");
var codexTranscript = (line) => [
  { type: "event_msg", payload: { type: "task_started", turn_attribution: { turn_id: "t1", turn_trigger: "user" } } },
  {
    type: "response_item",
    payload: { type: "message", role: "user", content: [{ type: "input_text", text: line }], internal_chat_message_metadata_passthrough: { turn_id: "t1", content_item_metadata: [{ provenance: { type: "user" } }] } }
  }
].map((row) => JSON.stringify(row)).join("\n");
function world(rows, transcript = claudeTranscript("[web card 3] go")) {
  return {
    exec: {
      "printenv WORK_SESSION": { stdout: "o/r#t-1\n" },
      [transcriptCommand(CONVERSATION)]: { stdout: transcript ?? "" }
    },
    fs: { ".work/t-1/log.jsonl": [sessionRow, ...rows].join("\n") + "\n" }
  };
}
var handsBack = (rows, transcript, ran = []) => ({
  actions: ran.map((command2) => ({ did: "run", command: command2 })),
  actor: ["main"],
  world: world(rows, transcript)
});
var work = definePack("work", {
  /**
   * Without it, a session in a driven repo reads `[work]` lines as a stranger's chatter, and
   * answers in the terminal where nobody is reading.
   */
  orientation: breadcrumb().at(session).text(
    [
      "This repo is driven by work. Each issue is a folder in the record, `.work/<id>/`, with one session of the repo's coding agent, Claude Code or Codex, in its own worktree; the work daemon types lines starting with `[work]` into it. `[work] /work <verb> <issue>` is the issue entering a status: invoke the `work` skill, which dispatches the verb. Any other `[work]` line relays the daemon, such as a merge of the issue's branch.",
      'The record is `.work/<id>/`: `issue.md`, `tasks/`, `log.jsonl` and `artifacts/`. Git ignores it, so what you write there is saved as written and never committed. You edit `issue.md` and the tasks as Markdown, and the daemon checks each change of `issue.md` and types what is wrong into its session; a move is `work issue next <id>`, which writes the `status:` line, and only where the skill says. Only the daemon writes `log.jsonl`: ask the human with `work log question --ask "\u2026"` and its body on stdin as a quoted heredoc, then stop; tell them with `work log fyi`. Never record a session\'s state in the record.',
      "Print every link as a Markdown link, so the terminal opens it: `[tasks/3.md](http://localhost:4242/work-3/3)`, the port being 4242 unless `web:` in `~/.work/config.yml` says otherwise.",
      '`.work/` links out of the repo. Run Node code there with `NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main"`, or it cannot find the repo\'s packages. Call the tool by `node_modules/.bin/<tool>`: that setting breaks `npx`.'
    ].join("\n")
  ).description("How a repo driven by work works: [work] lines, the work skill, the record in .work, work log."),
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
  playwrightClosesOwnBrowser: guardrail().at(command).check(playwrightAll).message(
    "`close-all` and `kill-all` of the Playwright CLI close every session's browsers on this machine, other issues' demos among them, whatever folder you type them in. Close your own browser by the name you opened it with: `npx -y @playwright/cli -s=<name> close`, `<name>` being the `-s=` you passed to `open`. `list --all` shows which are open."
  ).description("The Playwright CLI's `close-all` and `kill-all`, which close every session's browsers, are refused in every session at any status; a close by name, `-s=<name> close`, runs.").test({
    block: [
      "npx -y @playwright/cli close-all",
      "npx -y @playwright/cli kill-all",
      "npx @playwright/cli close-all >/dev/null 2>&1",
      "cd /tmp/scratch && npx @playwright/cli close-all >/dev/null 2>&1",
      "playwright-cli close-all",
      'PC="npx -y @playwright/cli@latest"; $PC close-all',
      "npx -y @playwright/cli@latest kill-all"
    ].map((command2) => ({ command: command2 })),
    pass: [
      "npx -y @playwright/cli -s=app-42 close",
      "npx -y @playwright/cli list --all",
      "grep -rn close-all docs",
      "git commit -m 'docs: the guard refuses close-all and kill-all'",
      "work log fyi --on 1 <<'WORKLOG'\nThe rule refuses close-all and kill-all.\nWORKLOG"
    ].map((command2) => ({ command: command2 }))
  }),
  /**
   * Without it, a session that your line from the web started ends its turn with a word in the
   * terminal, where you are not reading: you sent the line from the web, so the web is where you
   * are. It reads the session's transcript for the line that started the turn, so a turn you start
   * in the terminal, or the daemon starts with a `[work]` line, is handed back however old your last
   * line from the web is. Held once for each turn: flow lets the session's next hand-back through.
   */
  webLineGetsACard: guardrail().at(turnEnd).for(main).check(webLineWithoutCard).message(
    "Your turn is ending after a line from the web with no card raised. The human's last line came from the web, so they are reading the web and not this terminal. What they need to read or decide is a new work log question. With nothing for them to read or decide, hand back again."
  ).description("A main session's turn is held when a line from the web started it, read from the session's transcript, and the session has raised no question, no question has been answered any other way, the issue has not moved and the turn ran neither `work issue next` nor `work log question`.").test({
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
      handsBack([answerByLine], void 0, ["work log fyi --on 1 <<'WORKLOG'\nwork issue next moves it.\nWORKLOG"]),
      handsBack([answerByLine], void 0, ["git commit -m 'docs; work issue next moves it'"]),
      handsBack([answerByLine], void 0, ["grep -rn 'work issue next' docs", "work log fyi --on 1 <<'WORKLOG'\nThe rule reads work log question.\nWORKLOG"])
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
      handsBack([answerByLine], void 0, ["work issue next t-1"]),
      handsBack([answerByLine], void 0, [`work log question --ask "Which?" <<'WORKLOG'
A body.
WORKLOG`]),
      handsBack([answerByLine], void 0, ["just test && work issue next t-1"]),
      handsBack([answerByLine], void 0, ["/usr/local/bin/work issue next t-1"]),
      handsBack([answerByLine], void 0, ["bash -c 'work log question --ask x'"]),
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
      { actions: [], actor: ["main"], world: { exec: { "printenv WORK_SESSION": { stdout: "o/r#t-1\n" } } } }
    ]
  })
});
export {
  work
};
