// tools/shell.ts — running programs, shared by release.ts and deploy.ts.

import { spawnSync } from "node:child_process";

/** Run a program in `cwd`, showing its output, and throw when it fails. `stdin: "ignore"` gives it no terminal input. */
export function run(program: string, args: readonly string[], cwd: string, stdin: "inherit" | "ignore" = "inherit"): void {
  const ran = spawnSync(program, args, { cwd, stdio: [stdin, "inherit", "inherit"] });
  if (ran.status !== 0) throw new Error(`${program} ${args.join(" ")} failed (exit ${String(ran.status)}) in ${cwd}`);
}

/** Run a program in `cwd` and return what it printed, trimmed. Throws when it fails. */
export function out(program: string, args: readonly string[], cwd: string): string {
  const ran = spawnSync(program, args, { cwd, encoding: "utf8" });
  if (ran.status !== 0) throw new Error(`${program} ${args.join(" ")} failed (exit ${String(ran.status)}): ${ran.stderr}`);
  return ran.stdout.trim();
}
