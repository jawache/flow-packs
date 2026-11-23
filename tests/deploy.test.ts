// What `just deploy` does to a remote, in clones whose origin is a bare repo. The release itself and
// the check are stood in for (DEPLOY_*), so this runs in seconds; the real cut is held by the last test.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const PACKAGE = resolve(import.meta.dirname, "..");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

// One committer second for every commit, so no ordering by date can tell the commits apart.
const DATE = "2026-01-01T00:00:00Z";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_COMMITTER_DATE: DATE } }).trim();
}

// As release.ts does: the release commit on the branch, a commit above it, detached, that the tag points at, then the tag merged back with `-s ours`.
const RELEASE = "git commit -q --allow-empty -m 'chore(release): 0.1.1' && git switch -q --detach && git commit -q --allow-empty -m 'chore(release): v0.1.1 holds the built files' && git tag -a v0.1.1 -m v0.1.1 && git switch -q main && git merge -q -s ours --no-ff -m 'chore(release): v0.1.1 is reachable from the branch' v0.1.1";

/** A clone at tag v0.1.0 whose origin is a bare repo that holds it, then `after` commit headers. */
function scene(after: string[]): { clone: string; bare: string } {
  const root = mkdtempSync(join(tmpdir(), "deploy-test-"));
  roots.push(root);
  const bare = join(root, "origin.git");
  const clone = join(root, "clone");
  git(root, "init", "-q", "--bare", "-b", "main", bare);
  git(root, "init", "-q", "-b", "main", clone);
  git(clone, "remote", "add", "origin", bare);
  writeFileSync(join(clone, "work.yml"), "base: main\n");
  git(clone, "add", "work.yml");
  git(clone, "commit", "-q", "-m", "chore: start");
  git(clone, "tag", "-a", "v0.1.0", "-m", "v0.1.0");
  for (const header of after) git(clone, "commit", "-q", "--allow-empty", "-m", header);
  git(clone, "push", "-q", "origin", "HEAD", "v0.1.0");
  return { clone, bare };
}

/** A stand-in for `work`: writes the title and the body it is given into a file, as the real one writes a draft. */
function fakeWork(root: string): string {
  const path = join(root, "work");
  writeFileSync(path, '#!/bin/sh\nprintf "%s\\n" "$4" > "$(dirname "$0")/filed.md"; cat >> "$(dirname "$0")/filed.md"\n', { mode: 0o755 });
  return path;
}

const refs = (bare: string): string => git(bare, "for-each-ref");

function deploy(clone: string, env: Record<string, string> = {}): { status: number | null; out: string } {
  const ran = spawnSync("node", [join(PACKAGE, "tools", "deploy.ts")], {
    cwd: clone,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DEPLOY_INSTALL: "true", DEPLOY_CHECK: "true", DEPLOY_RELEASE: RELEASE, DEPLOY_WORK: "true", GIT_COMMITTER_DATE: DATE, ...env },
  });
  return { status: ran.status, out: `${ran.stdout}${ran.stderr}` };
}

describe("just deploy", () => {
  it("leaves the bare repo with the branch's head and the new tag after a fix", () => {
    const { clone, bare } = scene(["fix(x): a bug"]);
    const ran = deploy(clone);
    expect(ran.status, ran.out).toBe(0);
    const head = git(clone, "rev-parse", "HEAD");
    expect(git(bare, "rev-parse", "refs/heads/main")).toBe(head);
    expect(git(bare, "rev-parse", "refs/tags/v0.1.1^{commit}")).toBe(git(clone, "rev-parse", "v0.1.1^{commit}"));
  });

  it("pushes nothing when the check fails", () => {
    const { clone, bare } = scene(["feat: new"]);
    const before = refs(bare);
    const ran = deploy(clone, { DEPLOY_CHECK: "false" });
    expect(ran.status).not.toBe(0);
    expect(refs(bare)).toBe(before);
    expect(git(clone, "tag", "-l", "v0.1.1")).toBe("");
  });

  it("pushes nothing when the release fails", () => {
    const { clone, bare } = scene(["feat: new"]);
    const before = refs(bare);
    expect(deploy(clone, { DEPLOY_RELEASE: "false" }).status).not.toBe(0);
    expect(refs(bare)).toBe(before);
  });

  it("with only a docs commit since the last tag says so in one line and changes nothing", () => {
    const { clone, bare } = scene(["docs: words"]);
    const before = { refs: refs(bare), log: git(clone, "log", "-1", "--format=%H"), tags: git(clone, "tag") };
    // A step that would fail if it ran proves the decision comes first.
    const stub = fakeWork(join(clone, ".."));
    const ran = deploy(clone, { DEPLOY_INSTALL: "false", DEPLOY_WORK: stub });
    expect(ran.status).toBe(0);
    expect(ran.out.trim().split("\n")).toHaveLength(1);
    expect(existsSync(join(clone, "..", "filed.md"))).toBe(false);
    expect({ refs: refs(bare), log: git(clone, "log", "-1", "--format=%H"), tags: git(clone, "tag") }).toEqual(before);
  });

  it("stops with an error, and does not push, when the release makes no new tag", () => {
    const { clone, bare } = scene(["fix: a bug"]);
    const before = refs(bare);
    const ran = deploy(clone, { DEPLOY_RELEASE: "true" });
    expect(ran.status).not.toBe(0);
    expect(refs(bare)).toBe(before);
  });

  it("counts only plain version tags as releases, and never runs a tag's name as a command", () => {
    const { clone, bare } = scene(["fix: a bug"]);
    git(clone, "tag", "v9;touch${IFS}marker");
    const ran = deploy(clone);
    expect(ran.status, ran.out).toBe(0);
    expect(existsSync(join(clone, "marker"))).toBe(false);
    expect(git(bare, "tag", "-l", "v0.1.1")).toBe("v0.1.1");
  });

  it("undoes a release that fails partway: the head and the release tags are as they were", () => {
    const { clone, bare } = scene(["feat: new"]);
    const before = { head: git(clone, "rev-parse", "HEAD"), tags: git(clone, "tag", "-l", "v*"), refs: refs(bare) };
    const ran = deploy(clone, { DEPLOY_RELEASE: "git commit -q --allow-empty -m 'chore(release): 0.1.1' && git tag -a v0.1.1 -m v0.1.1 && false" });
    expect(ran.status).not.toBe(0);
    expect({ head: git(clone, "rev-parse", "HEAD"), tags: git(clone, "tag", "-l", "v*"), refs: refs(bare) }).toEqual(before);
  });

  it("refuses to run on any branch but the base, and changes no ref on origin", () => {
    const { clone, bare } = scene(["fix: a bug"]);
    git(clone, "switch", "-q", "-c", "issue-branch");
    const before = refs(bare);
    const stub = fakeWork(join(clone, ".."));
    const ran = deploy(clone, { DEPLOY_WORK: stub });
    expect(ran.status).not.toBe(0);
    expect(git(clone, "tag", "-l", "v0.1.1")).toBe("");
    expect(refs(bare)).toBe(before);
    expect(readFileSync(join(clone, "..", "filed.md"), "utf8")).toContain("a deploy runs only on main");
  });

  it("stops with an error when origin cannot be reached, never reading that as a missing tag", () => {
    const { clone } = scene(["fix: a bug"]);
    git(clone, "remote", "set-url", "origin", join(clone, "no-such-repo.git"));
    const ran = deploy(clone);
    expect(ran.status).not.toBe(0);
    expect(ran.out).not.toContain("pushing it");
  });

  it("pushes a release that is tagged here and not on origin, whatever landed since", () => {
    const { clone, bare } = scene(["fix: a bug"]);
    git(clone, "commit", "-q", "--allow-empty", "-m", "chore(release): 0.1.1");
    git(clone, "tag", "-a", "v0.1.1", "-m", "v0.1.1");
    git(clone, "commit", "-q", "--allow-empty", "-m", "docs: after");
    const ran = deploy(clone, { DEPLOY_CHECK: "false", DEPLOY_RELEASE: "false" });
    expect(ran.status, ran.out).toBe(0);
    expect(git(bare, "tag", "-l", "v0.1.1")).toBe("v0.1.1");
    expect(git(bare, "rev-parse", "refs/heads/main")).toBe(git(clone, "rev-parse", "HEAD"));
  });
});

describe("a deploy that fails", () => {
  it("files one issue whose title names the merged issue and whose body ends with the last lines printed", () => {
    const { clone } = scene(["fix: a bug"]);
    git(clone, "checkout", "-q", "-b", "side");
    git(clone, "commit", "-q", "--allow-empty", "-m", "side work");
    git(clone, "checkout", "-q", "main");
    git(clone, "merge", "-q", "--no-ff", "-m", "Merge remote-tracking branch 'origin/flow-packs-9-x'", "side");
    const stub = fakeWork(join(clone, ".."));
    const ran = deploy(clone, { DEPLOY_WORK: stub, DEPLOY_CHECK: "echo one; echo two >&2; exit 3" });
    expect(ran.status).not.toBe(0);
    const filed = readFileSync(join(clone, "..", "filed.md"), "utf8");
    expect(filed.split("\n")[0]).toBe("The release after flow-packs-9 failed");
    expect(filed).toMatch(/one\ntwo\n[^\n]*failed \(exit 3\)[^\n]*\n```\n$/);
  });

  it("titles the issue after the merged issue even when the failure comes after the release's own merge", () => {
    const { clone } = scene(["fix: a bug"]);
    git(clone, "checkout", "-q", "-b", "side");
    git(clone, "commit", "-q", "--allow-empty", "-m", "side work");
    git(clone, "checkout", "-q", "main");
    git(clone, "merge", "-q", "--no-ff", "-m", "Merge remote-tracking branch 'origin/flow-packs-9-x'", "side");
    const stub = fakeWork(join(clone, ".."));
    const ran = deploy(clone, { DEPLOY_WORK: stub, DEPLOY_RELEASE: `${RELEASE} && git remote set-url origin ${join(clone, "no-such-repo.git")}` });
    expect(ran.status).not.toBe(0);
    const filed = readFileSync(join(clone, "..", "filed.md"), "utf8");
    expect(filed.split("\n")[0]).toBe("The release after flow-packs-9 failed");
    expect(filed).toContain("the step `push`");
  });

  it("still fails, and says why, when filing fails", () => {
    const { clone } = scene(["fix: a bug"]);
    const ran = deploy(clone, { DEPLOY_WORK: "false", DEPLOY_CHECK: "false" });
    expect(ran.status).not.toBe(0);
    expect(ran.out).toContain("could not file the issue");
  });
});

describe("just release", () => {
  it("changes no remote", () => {
    const { bare } = scene([]);
    // A real cut, in a clone of this repo with this checkout's dependencies, beside a bare origin.
    const root = mkdtempSync(join(tmpdir(), "release-test-"));
    roots.push(root);
    const real = join(root, "flow-packs");
    execFileSync("git", ["clone", "-q", "--local", PACKAGE, real]);
    git(real, "remote", "set-url", "origin", bare);
    mkdirSync(join(real, "node_modules"));
    for (const name of readdirSync(join(PACKAGE, "node_modules"))) symlinkSync(join(PACKAGE, "node_modules", name), join(real, "node_modules", name));
    const before = refs(bare);
    const tagsBefore = git(real, "tag", "-l", "v*");
    const ran = spawnSync("node", ["tools/release.ts", "cut"], { cwd: real, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
    expect(ran.status, ran.stderr).toBe(0);
    expect(git(real, "tag", "-l", "v*")).not.toBe(tagsBefore);
    expect(refs(bare)).toBe(before);
  }, 60_000);
});
