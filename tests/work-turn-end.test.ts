// One call to a real program: flow's own turn-end hook, run twice after a line from the web. The
// rule's cases write flow's log rows themselves; only flow running writes the real ones, so this
// holds that the rows the rule reads are the rows flow writes.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const PACKAGE = resolve(import.meta.dirname, "..");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("holds the first hand-back after a line from the web, and lets the second through", () => {
  const project = mkdtempSync(join(tmpdir(), "work-turn-end-"));
  roots.push(project);
  symlinkSync(join(PACKAGE, "node_modules"), join(project, "node_modules"));
  writeFileSync(
    join(project, "flow.config.ts"),
    `import { defineConfig, pack } from "@jawache/flow";\nimport { work } from ${JSON.stringify(join(PACKAGE, "packs/work.ts"))};\nexport default defineConfig([pack(work)]);\n`,
  );
  mkdirSync(join(project, ".work/t-1"), { recursive: true });
  writeFileSync(join(project, ".work/t-1/log.jsonl"), '{"at":"2026-11-25T16:00:00Z","kind":"answer","by":"line"}\n');
  spawnSync("git", ["init", "-q", "."], { cwd: project });

  const handBack = (): { status: number | null; output: string } => {
    const ran = spawnSync("node", [join(PACKAGE, "node_modules/@jawache/flow/dist/flow.mjs"), "hook", "stop"], {
      cwd: project,
      encoding: "utf8",
      env: { ...process.env, WORK_SESSION: "o/r#t-1" },
      input: JSON.stringify({ session_id: "s", transcript_path: "/dev/null", cwd: project, hook_event_name: "Stop", stop_hook_active: false }),
    });
    return { status: ran.status, output: ran.stdout + ran.stderr };
  };

  const first = handBack();
  expect(first.status).toBe(2);
  expect(first.output).toContain("work.webLineGetsACard");
  expect(handBack().status).toBe(0);
});
