// packs/work.ts
import { breadcrumb, command, defineCategory, definePack, guardrail, programName, session, shellCommands, turnEnd } from "@jawache/flow";
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
var WEB_LINE_RULE = "work.webLineGetsACard";
var holdDetail = (issue) => `issue ${issue}`;
function issueOf(session2) {
  const id = session2.trim().split("#")[1];
  return id === void 0 || id === "" ? null : id;
}
var lastWebLine = (rows) => rows.findLastIndex((row) => row.kind === "note" || row.kind === "answer" && row.by === "line");
var settles = (row) => row.kind === "question" || row.kind === "answer" || row.kind === "event" && /^Moved to /.test(row.body ?? "");
function turnIsHeld(rows, holds) {
  const web = lastWebLine(rows);
  if (web < 0) return false;
  if (rows.slice(web + 1).some(settles)) return false;
  const since = Date.parse(rows[web]?.at ?? "");
  return !holds.some((hold2) => Date.parse(hold2) >= since);
}
function jsonl(text) {
  return text.split("\n").filter((line) => line.trim() !== "").flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}
var holdTimes = (flowLog, issue) => jsonl(flowLog).flatMap(
  (row) => row.kind === "guardrail" && row.id === WEB_LINE_RULE && row.detail === holdDetail(issue) && row.ts !== void 0 ? [row.ts] : []
);
var main = defineCategory("main", (facts) => !facts.subagent);
var webLineWithoutCard = async (ctx) => {
  if (!ctx.actor.includes("main")) return ctx.ok();
  const issue = issueOf((await ctx.exec("printenv WORK_SESSION")).stdout);
  if (issue === null) return ctx.ok();
  const path = `.work/${issue}/log.jsonl`;
  if (!await ctx.fs.exists(path)) return ctx.ok();
  const rows = jsonl(await ctx.fs.read(path));
  if (!turnIsHeld(rows, [])) return ctx.ok();
  const flowLog = (await ctx.exec(`grep -h '"id":"${WEB_LINE_RULE}"' .flow/log/*.jsonl`)).stdout;
  return turnIsHeld(rows, holdTimes(flowLog, issue)) ? ctx.fail(holdDetail(issue)) : ctx.ok();
};
function world(rows, flowLog = []) {
  return {
    exec: {
      "printenv WORK_SESSION": { stdout: "o/r#t-1\n" },
      [`grep -h '"id":"${WEB_LINE_RULE}"' .flow/log/*.jsonl`]: { stdout: flowLog.join("\n") }
    },
    fs: { ".work/t-1/log.jsonl": rows.join("\n") + "\n" }
  };
}
var hold = (ts, issue) => JSON.stringify({ ts, kind: "guardrail", id: WEB_LINE_RULE, detail: holdDetail(issue) });
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
   * Without it, a session that your line from the web reached ends its turn with a word in the
   * terminal, where you are not reading: you sent the line from the web, so the web is where you
   * are. Held once for each line, so a session with nothing for you to read or decide hands back
   * again and is let through.
   */
  webLineGetsACard: guardrail().at(turnEnd).for(main).check(webLineWithoutCard).message(
    "Your turn is ending after a line from the web with no card raised. The human's last line came from the web, so they are reading the web and not this terminal. What they need to read or decide is a new work log question. With nothing for them to read or decide, hand back again."
  ).description("A main session's turn is held once when the human's last line to it came from the web and it has raised no question, no question has been answered any other way and the issue has not moved since.").test({
    block: [
      { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}']) },
      { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"note"}']) },
      { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}', '{"at":"2026-11-25T16:01:00Z","kind":"fyi"}']) },
      // a hold for another issue, or one made before the line, does not count
      {
        actions: [],
        actor: ["main"],
        world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}'], [hold("2026-11-25T16:05:00.000Z", "other-1"), hold("2026-11-25T15:00:00.000Z", "t-1")])
      },
      // a hold made before a newer line from the web does not count
      { actions: [], actor: ["main"], world: world(['{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}', '{"at":"2026-11-25T16:10:00Z","kind":"note"}'], [hold("2026-11-25T16:00:30.000Z", "t-1")]) }
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
      { actions: [], actor: ["main"], world: { exec: { "printenv WORK_SESSION": { stdout: "o/r#t-1\n" } } } }
    ]
  })
});
export {
  turnIsHeld,
  work
};
