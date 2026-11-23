// tools/deploy.ts — the shell behind `just deploy`.
//
// It decides first: with no `feat`, `fix` or breaking change since the last tag it says so in one
// line and stops, before anything runs. Otherwise it installs from the lockfile, runs
// `just release-check`, then `just release`, then pushes the branch and the new tag. A failed step
// stops it with a non-zero exit before any later step, so nothing reaches the remote unless the
// check and the release both passed. A release that is tagged here and not on origin, as after a
// push that failed, is pushed by the next deploy, whatever landed since.
//
// It never prompts: every step runs with standard input from /dev/null, as the daemon runs it.
// The three steps can be stood in for by DEPLOY_INSTALL, DEPLOY_CHECK and DEPLOY_RELEASE (a shell
// line each), which the tests use.

import { spawnSync } from "node:child_process";
import { out, run } from "./shell.ts";
import { shouldRelease } from "./release-decision.ts";

const CWD = process.cwd();

/** Run a shell line, showing its output, with no terminal input. Throws when it fails. */
function step(line: string): void {
  run("sh", ["-c", line], CWD, "ignore");
}

/** Run git and return what it printed, trimmed; "" when it fails. */
function git(...args: string[]): string {
  try {
    return out("git", args, CWD);
  } catch {
    return "";
  }
}

/** The newest `v*` tag reachable from HEAD, or "". */
function lastTag(): string {
  return git("describe", "--tags", "--abbrev=0", "--match", "v*");
}

/** Whether origin has the tag. Exit 2 of ls-remote is absent; any other failure, such as an origin that cannot be reached, throws. */
function onOrigin(tag: string): boolean {
  const ran = spawnSync("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`], { cwd: CWD, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (ran.status === 0) return true;
  if (ran.status === 2) return false;
  throw new Error(`cannot tell whether ${tag} is on origin (git ls-remote exit ${String(ran.status)}): ${ran.stderr.trim()}`);
}

function push(tag: string): void {
  step("git push origin HEAD");
  step(`git push origin ${tag}`);
}

function deploy(): void {
  const before = lastTag();

  // A release tagged here and missing on origin is pushed whatever landed since.
  if (before !== "" && !onOrigin(before)) {
    process.stdout.write(`deploy: ${before} is not on origin, pushing it\n`);
    push(before);
    return;
  }

  const messages = git("log", "-z", "--format=%B", before === "" ? "HEAD" : `${before}..HEAD`).split("\0").filter((m) => m.trim() !== "");
  if (!shouldRelease(messages)) {
    process.stdout.write(`deploy: nothing to release since ${before === "" ? "the start" : before}: no feat, fix or breaking change\n`);
    return;
  }

  step(process.env.DEPLOY_INSTALL ?? "just install");
  step(process.env.DEPLOY_CHECK ?? "just release-check");
  step(process.env.DEPLOY_RELEASE ?? "just release");
  const tag = lastTag();
  if (tag === "" || tag === before) throw new Error("the release made no new tag");
  push(tag);
}

try {
  deploy();
} catch (error) {
  process.stderr.write(`deploy: ${(error as Error).message}\n`);
  process.exitCode = 1;
}
