// tools/deploy.ts — the shell behind `just deploy`.
//
// It decides first: with no `feat`, `fix` or breaking change since the last tag it says so in one
// line and stops, before anything runs. Otherwise it installs from the lockfile, runs
// `just release-check`, then `just release`, then pushes the branch and the new tag, then emits
// `work event release.cut --package jawache/flow-packs --version <tag>`, so each project's updater
// takes the release. A failed step stops it with a non-zero exit before any later step, so nothing
// reaches the remote unless the check and the release both passed. A release that is tagged here
// and not on origin, as after a push that failed, is pushed, and its event emitted, by the next
// deploy, whatever landed since. A failed event fails the deploy and files its issue, with the release left pushed.
//
// It never prompts: every step runs with standard input from /dev/null, as the daemon runs it.
// A step that fails, or any other failure, files one issue in this repo with `work issue new`, whose
// title and body are made by release-failure.ts; a deploy with nothing to release files none. When
// the filing itself fails, the deploy still exits non-zero and prints why.
// It runs only on the branch `base:` names in work.yml, and a release that fails partway is undone:
// the branch goes back to where it was and a tag the release made is deleted.
// The steps can be stood in for by DEPLOY_INSTALL, DEPLOY_CHECK and DEPLOY_RELEASE (a shell line
// each) and `work` by DEPLOY_WORK (a program), which the tests use.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { out, tee } from "./shell.ts";
import { shouldRelease } from "./release-decision.ts";
import { failureIssue, releaseCutArgs } from "./release-failure.ts";

const CWD = process.cwd();
/** The program that stands in for `work`: DEPLOY_WORK in the tests, else `work`. */
const WORK = process.env.DEPLOY_WORK ?? "work";

/** What the steps have printed so far, and the step that is running: what a failure's issue reports. */
const printed: string[] = [];
let current = "check branch";
/** The command that sends the release event again, once the deploy is at that step. */
let retry = "";

/** Run a shell line with no terminal input and show its output when it ends, not as it goes. Throws when it fails. */
function step(name: string, line: string, args: readonly string[] = []): void {
  current = name;
  tee(line, CWD, printed, args);
}

/** Run git and return what it printed, trimmed. Throws when it fails. */
function git(...args: string[]): string {
  return out("git", args, CWD);
}

/** The highest plain version tag (`v1.2.3`) merged into HEAD, or "". Not `git describe`'s pick: a release tag is reachable only through the release merge's second parent, and describe can read a tag before it. */
function lastTag(): string {
  return git("tag", "--merged", "HEAD", "--list", "v*", "--sort=-v:refname").split("\n").find((tag) => /^v\d+\.\d+\.\d+$/.test(tag)) ?? "";
}

/** The `base:` of work.yml, the one branch a deploy runs on. */
function baseBranch(): string {
  const base = /^base:\s*(\S+)/m.exec(readFileSync(join(CWD, "work.yml"), "utf8"))?.[1];
  if (base === undefined) throw new Error("work.yml has no base:");
  return base;
}

/** Delete every release tag that was not there before, then put the branch back at `head`. `--keep` refuses rather than lose uncommitted work, so the tags go first and a refused reset leaves none half-made. */
function undo(head: string, tagsBefore: string): void {
  const had = new Set(tagsBefore.split("\n"));
  for (const tag of git("tag", "--list", "v*").split("\n")) if (tag !== "" && !had.has(tag)) git("tag", "-d", tag);
  git("reset", "--keep", head);
}

/** Whether origin has the tag. Exit 2 of ls-remote is absent; any other failure, such as an origin that cannot be reached, throws. */
function onOrigin(tag: string): boolean {
  const ran = spawnSync("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`], { cwd: CWD, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (ran.status === 0) return true;
  if (ran.status === 2) return false;
  throw new Error(`cannot tell whether ${tag} is on origin (git ls-remote exit ${String(ran.status)}): ${ran.stderr.trim()}`);
}

/** Push the branch and the tag, then tell each project's updater about the release. The event runs only once the remote has the tag. */
function publish(tag: string): void {
  step("push", "git push origin HEAD");
  step("push", 'git push origin "$1"', [tag]);
  retry = ["work", ...releaseCutArgs(tag)].join(" ");
  step("release.cut", '"$@"', [WORK, ...releaseCutArgs(tag)]);
}

function deploy(): void {
  const base = baseBranch();
  const branch = git("branch", "--show-current");
  if (branch !== base) throw new Error(`a deploy runs only on ${base}, and this is ${branch === "" ? "a detached HEAD" : branch}`);

  current = "check origin";
  const before = lastTag();

  // A release tagged here and missing on origin is pushed whatever landed since.
  if (before !== "" && !onOrigin(before)) {
    process.stdout.write(`deploy: ${before} is not on origin, pushing it\n`);
    publish(before);
    return;
  }

  const messages = git("log", "-z", "--format=%B", before === "" ? "HEAD" : `${before}..HEAD`).split("\0").filter((m) => m.trim() !== "");
  if (!shouldRelease(messages)) {
    process.stdout.write(`deploy: nothing to release since ${before === "" ? "the start" : before}: no feat, fix or breaking change\n`);
    return;
  }

  step("install", process.env.DEPLOY_INSTALL ?? "just install");
  step("release-check", process.env.DEPLOY_CHECK ?? "just release-check");
  const head = git("rev-parse", "HEAD");
  const tagsBefore = git("tag", "--list", "v*");
  let tag: string;
  try {
    step("release", process.env.DEPLOY_RELEASE ?? "just release");
    tag = lastTag();
    if (tag === "" || tag === before) throw new Error("the release made no new tag");
  } catch (error) {
    try {
      undo(head, tagsBefore);
    } catch (undoError) {
      printed.push((undoError as Error).message);
    }
    throw error;
  }
  publish(tag);
}

/** File the failure as an issue in this repo's record. Never throws: a failure to file is printed, and the deploy still fails. */
function fileFailure(error: Error): void {
  printed.push(error.message);
  // Only here is a failed git read as "": a throw would hide the real error.
  let header = "";
  try {
    header = git("log", "--first-parent", "--merges", "-1", "--format=%s", "--invert-grep", "--grep=^chore(release)");
  } catch {
    // The issue is filed without the merged issue's id.
  }
  const { title, body } = failureIssue(header, current, printed, retry);
  const filed = spawnSync(WORK, ["issue", "new", "--title", title, "--body", "-"], { cwd: CWD, encoding: "utf8", input: body });
  if (filed.status === 0) process.stderr.write(`deploy: filed ${filed.stdout.trim()}\n`);
  else process.stderr.write(`deploy: could not file the issue (${filed.error?.message ?? `work issue new exit ${String(filed.status)}`}): ${filed.stderr.trim()}\n`);
}

try {
  deploy();
} catch (error) {
  process.stderr.write(`deploy: ${(error as Error).message}\n`);
  fileFailure(error as Error);
  process.exitCode = 1;
}
