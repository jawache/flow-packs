---
summary: "the `work` pack: 2 guardrails · 1 breadcrumb · fires at: session · command · turn-end · takes no parameters"
---

# The `work` pack

The rules for a repo driven by [work](https://github.com/jawache/work).

## Binding it

```ts
import { defineConfig, pack } from "@jawache/flow";
import { work } from "@jawache/flow-packs/work";

export default defineConfig([pack(work)]);
```

## What the repo needs in place

- `work` on the `PATH`. It provides `work log`.
- A `work.yml` at the repo root.

## Entries

| Entry | Kind | What it does |
| --- | --- | --- |
| [`work.orientation`](#workorientation) | breadcrumb | Tells each session how a repo driven by work works |
| [`work.playwrightClosesOwnBrowser`](#workplaywrightclosesownbrowser) | guardrail | Refuses the Playwright CLI's `close-all` and `kill-all` |
| [`work.webLineGetsACard`](#workweblinegetsacard) | guardrail | [Holds](./glossary.md#hold) a turn that a [line from the web](./glossary.md#line-from-the-web) started, when it ends with no question raised |

## `work.orientation`

A breadcrumb.

- **Shown** once, at the start of a session.

### What the agent reads

```text
This repo is driven by work. Each issue is a folder in the record, `.work/<id>/`, with one session of the repo's coding agent, Claude Code or Codex, in its own worktree; the work daemon types lines starting with `[work]` into it. `[work] /work <verb> <issue>` is the issue entering a status: invoke the `work` skill, which dispatches the verb. Any other `[work]` line relays the daemon, such as a merge of the issue's branch.
The record is `.work/<id>/`: `issue.md`, `tasks/`, `log.jsonl` and `artifacts/`. Git ignores it, so what you write there is saved as written and never committed. You edit `issue.md` and the tasks as Markdown, and the daemon checks each change of `issue.md` and types what is wrong into its session; a move is `work issue next <id>`, which writes the `status:` line, and only where the skill says. Only the daemon writes `log.jsonl`: ask the human with `work log question --ask "…"` and its body on stdin as a quoted heredoc, then stop; tell them with `work log fyi`. Never record a session's state in the record.
Print every link as a Markdown link, so the terminal opens it: `[tasks/3.md](http://localhost:4242/work-3/3)`, the port being 4242 unless `web:` in `~/.work/config.yml` says otherwise.
`.work/` links out of the repo. Run Node code there with `NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main"`, or it cannot find the repo's packages. Call the tool by `node_modules/.bin/<tool>`: that setting breaks `npx`.
```

## `work.playwrightClosesOwnBrowser`

A guardrail.

- **Refuses at** a shell command is about to run.
- **Reads** the command line, parsed. The CLI is the program, an argument of `npx`, or a variable the line expands as the program.

### What the agent reads when refused

```text
`close-all` and `kill-all` of the Playwright CLI close every session's browsers on this machine, other issues' demos among them, whatever folder you type them in. Close your own browser by the name you opened it with: `npx -y @playwright/cli -s=<name> close`, `<name>` being the `-s=` you passed to `open`. `list --all` shows which are open.
```

### Examples

| Command | Result |
| --- | --- |
| `npx -y @playwright/cli close-all` | refused |
| `npx -y @playwright/cli@latest kill-all` | refused |
| `playwright-cli close-all` | refused |
| `PC="npx -y @playwright/cli@latest"; $PC close-all` | refused |
| `npx -y @playwright/cli -s=app-42 close` | runs |
| `npx -y @playwright/cli list --all` | runs |
| `grep -rn close-all docs` | runs |
| `git commit -m 'docs: the guard refuses close-all and kill-all'` | runs |

## `work.webLineGetsACard`

A guardrail. When your line from the web starts a session's turn, the session's next word to you is on the web too.

- **Holds at** turn-end: the session is about to hand back.
- **For** the main session only. A subagent's hand-back is never held.
- **Reads** four things:
  - `WORK_SESSION`, for the issue's id;
  - the issue's log, `.work/<id>/log.jsonl`;
  - the session's transcript, Claude Code's or Codex's, for the line that started the turn;
  - the commands the turn ran, for a question it raised or a move it made.

### When it holds

It holds the turn when both are true:

1. A [line from the web](./glossary.md#line-from-the-web) started the turn.
2. Since that line, the session has raised no question, no question has been answered any other way, and the issue has not moved.

It holds once for each line from the web. flow lets the session's next hand-back through.

With no transcript to read, the turn is handed back.

### What the agent reads when held

```text
Your turn is ending after a line from the web with no card raised. The human's last line came from the web, so they are reading the web and not this terminal. What they need to read or decide is a new work log question. With nothing for them to read or decide, hand back again.
```

### Examples

Each row is the line that started the turn, and the end of the issue's `log.jsonl`, oldest first, when the main session hands back.

| The turn started with | The log ends with | Result |
| --- | --- | --- |
| `[web card 3] go` | an `answer` with `by: line` | held |
| `[web] a message` | a `note` | held |
| `[web card 3] go` | an `answer` with `by: line`, then a `question` | handed back |
| `[web card 3] go` | an `answer` with `by: line`, then a move of the issue | handed back |
| `[web card 3] go` | an `answer` with `by: line`, then an `answer` with `by: session` | handed back |
| `[web card 3] go` | an `fyi` after an `answer` with `by: line` | held |
| a line you typed in the terminal | an `answer` with `by: line` | handed back |
| `[work] /work plan work-3` | an `answer` with `by: line` | handed back |
