// tools/release.ts — the shell behind `just release` and `just release-check`.
//
// A release is a tag that holds the built packs. Two commits make it: the release commit on the
// branch (the version and the changelog, made by commit-and-tag-version with its own tag turned
// off), and a second commit above it that holds dist/. The tag points at the second, and the branch
// stays at the first, so the branch never holds built files and the tag always does. A merge with
// `-s ours` then makes the tag reachable from the branch without bringing its files. A project
// installs the tag with `npm i -D --allow-git=root github:jawache/flow-packs#v<version>`.
//
//   node tools/release.ts cut     the release commit, the release build, the commit that holds dist/, the tag
//   node tools/release.ts check   the same in a throwaway clone, then the tag installed into a scratch
//                                 project beside flow, every pack bound from it and its cases run
//
// Nothing here pushes, and nothing publishes.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { out, run } from "./shell.ts";

const PACKAGE = resolve(import.meta.dirname, "..");

/** What a tag ships of dist/: every bundle and the types. */
function built(repo: string): string[] {
  return [...readdirSync(join(repo, "dist")).filter((name) => name.endsWith(".mjs")).map((name) => `dist/${name}`), "dist/types"];
}

/** The release in `repo`: the release commit, the release build, then the commit that holds dist/ and the tag on it. Returns the version. */
function cut(repo: string, extra: readonly string[] = []): string {
  run("npx", ["commit-and-tag-version", "--skip.tag", ...extra], repo);
  const version = (JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { version: string }).version;
  run("just", ["build-release"], repo);

  const branch = spawnSync("git", ["symbolic-ref", "--short", "-q", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();
  const release = out("git", ["rev-parse", "HEAD"], repo);
  const files = built(repo);
  run("git", ["switch", "--detach", "-q"], repo);
  try {
    run("git", ["add", "-f", "--", ...files], repo);
    run("git", ["commit", "-q", "-m", `chore(release): v${version} holds the built files`], repo);
    run("git", ["tag", "-a", `v${version}`, "-m", `v${version}`], repo);
  } catch (error) {
    spawnSync("git", ["reset", "-q"], { cwd: repo });
    spawnSync("git", ["switch", "-q", branch === "" ? release : branch], { cwd: repo });
    throw error;
  }
  run("git", ["switch", "-q", branch === "" ? release : branch], repo);
  // The tag's commit is merged back with `-s ours`: the branch's files stay exactly as they were, so
  // the branch still holds no dist/, and the tag becomes reachable from the branch, which is where
  // commit-and-tag-version looks for the last release. Without it, the next release counts from the
  // tag before, and its changelog repeats this one.
  run("git", ["merge", "-q", "-s", "ours", "--no-ff", "-m", `chore(release): v${version} is reachable from the branch`, `v${version}`], repo);
  run("git", ["restore", "--source", `v${version}`, "--worktree", "--", ...files], repo);
  return version;
}

/** Every file under `dir`, relative to it. */
function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1));
}

/** The release, made in a throwaway clone and installed from its tag as a project would. */
function check(): void {
  const root = mkdtempSync(join(tmpdir(), "flow-packs-release-check-"));
  try {
    const clone = join(root, "flow-packs");
    run("git", ["clone", "-q", "--local", PACKAGE, clone], PACKAGE);
    for (const key of ["user.name", "user.email"]) run("git", ["config", key, out("git", ["config", key], PACKAGE)], clone);
    // The clone builds with this checkout's dependencies, and its commits meet the same commit gate.
    mkdirSync(join(clone, "node_modules"));
    for (const name of readdirSync(join(PACKAGE, "node_modules"))) symlinkSync(join(PACKAGE, "node_modules", name), join(clone, "node_modules", name));
    run("git", ["config", "core.hooksPath", ".githooks"], clone);

    const version = cut(clone, process.argv.slice(3));
    const tag = `v${version}`;
    process.stdout.write(`\nrelease-check: ${tag} cut in ${clone}\n`);
    process.stdout.write(`  release commit  ${out("git", ["log", "-1", "--format=%h %s", `${tag}^`], clone)}\n`);
    process.stdout.write(`  tagged commit   ${out("git", ["log", "-1", "--format=%h %s", tag], clone)}\n`);
    if (out("git", ["ls-tree", "-r", "--name-only", `${tag}^`, "dist"], clone) !== "") throw new Error("the release commit holds dist/: only the tag's commit may");

    // A scratch project with flow installed as this repo installs it, and the packs from the tag.
    const project = join(root, "project");
    mkdirSync(project);
    run("npm", ["init", "-y", "--silent"], project);
    const pkg = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as { devDependencies: Record<string, string> };
    const flow = pkg.devDependencies["@jawache/flow"];
    if (flow === undefined) throw new Error("package.json has no devDependency on @jawache/flow");
    run("npm", ["i", "-D", "--ignore-scripts", "--allow-git=root", `@jawache/flow@${flow}`, `git+file://${clone}#${tag}`], project);

    const installed = join(project, "node_modules", "@jawache", "flow-packs");
    process.stdout.write(`\nrelease-check: what a project gets in node_modules/@jawache/flow-packs\n`);
    for (const file of files(installed).sort()) process.stdout.write(`  ${file}\n`);

    // Every pack bound from the INSTALLED package, with the same parameters tests/all.config.ts uses.
    const config = readFileSync(join(PACKAGE, "tests", "all.config.ts"), "utf8").replaceAll(/"\.\.\/packs\/([a-z]+)\.ts"/g, '"@jawache/flow-packs/$1"');
    writeFileSync(join(project, "flow.config.ts"), config);
    run("node", [join(project, "node_modules", "@jawache", "flow", "dist", "flow.mjs"), "test", "flow.config.ts"], project);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const verb = process.argv[2];
try {
  if (verb === "cut") {
    const version = cut(PACKAGE, process.argv.slice(3));
    process.stdout.write(`\nLocal only: nothing was pushed.\nv${version} holds dist/; the branch stays at the release commit.\nTo share it:  git push origin HEAD && git push origin v${version}\n`);
  } else if (verb === "check") {
    check();
  } else {
    process.stderr.write("usage: node tools/release.ts cut | check\n");
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`release: ${(error as Error).message}\n`);
  process.exitCode = 1;
}
