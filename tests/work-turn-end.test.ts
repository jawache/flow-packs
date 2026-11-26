// One call to a real program: flow's own turn-end hook, run against a transcript on disk. The rule's
// cases hand it canned transcripts; only flow running proves that the transcript the rule finds by
// the conversation id, and the turn flow reads from it, are the ones a real hand-back has.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const PACKAGE = resolve(import.meta.dirname, "..");
const CONVERSATION = "00000000-0000-4000-8000-000000000001";
const { CODEX_HOME: _codexHome, ...envWithoutCodexHome } = process.env; // this machine's own Codex folder is never read
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** A project whose log ends with a line from the web, and whose conversation's transcript is the one flow's hook is given: a turn that `line` started. */
function handBackAfter(line: string): { status: number | null; output: string } {
  const root = mkdtempSync(join(tmpdir(), "work-turn-end-"));
  roots.push(root);
  const project = join(root, "project");
  mkdirSync(join(project, ".work/t-1"), { recursive: true });
  symlinkSync(join(PACKAGE, "node_modules"), join(project, "node_modules"));
  writeFileSync(
    join(project, "flow.config.ts"),
    `import { defineConfig, pack } from "@jawache/flow";\nimport { work } from ${JSON.stringify(join(PACKAGE, "packs/work.ts"))};\nexport default defineConfig([pack(work)]);\n`,
  );
  writeFileSync(
    join(project, ".work/t-1/log.jsonl"),
    [
      { at: "2026-11-25T15:00:00Z", who: "daemon", kind: "event", body: "Session resumed.", session: CONVERSATION },
      { at: "2026-11-25T16:00:00Z", kind: "answer", by: "line" },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  const config = join(root, "claude-config");
  const transcript = join(config, "projects/p", `${CONVERSATION}.jsonl`);
  mkdirSync(join(config, "projects/p"), { recursive: true });
  writeFileSync(
    transcript,
    [
      { type: "user", origin: { kind: "human" }, message: { role: "user", content: line } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Working." }] } },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  spawnSync("git", ["init", "-q", "."], { cwd: project });
  const ran = spawnSync("node", [join(PACKAGE, "node_modules/@jawache/flow/dist/flow.mjs"), "hook", "stop"], {
    cwd: project,
    encoding: "utf8",
    env: { ...envWithoutCodexHome, CLAUDE_CONFIG_DIR: config, WORK_SESSION: "o/r#t-1" },
    input: JSON.stringify({ session_id: CONVERSATION, transcript_path: transcript, cwd: project, hook_event_name: "Stop", stop_hook_active: false }),
  });
  return { status: ran.status, output: ran.stdout + ran.stderr };
}

it("holds a turn a line from the web started, and hands back one a terminal line started, with the same log", () => {
  const held = handBackAfter("[web card 3] go");
  expect(held.status).toBe(2);
  expect(held.output).toContain("work.webLineGetsACard");
  const handedBack = handBackAfter("Let me ask a question. Does it work?");
  expect(handedBack.status).toBe(0);
  expect(handedBack.output).not.toContain("work.webLineGetsACard");
});
