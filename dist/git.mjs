// packs/git.ts
import {
  banCommands,
  breadcrumb,
  command,
  commit,
  defineCheck,
  definePack,
  commitMessage,
  escapeRe,
  gitCommands,
  guardrail,
  jsonInvariant,
  programName,
  quoteArg,
  session,
  shellCommands
} from "@jawache/flow";
var COMMIT_SHORT_VALUE = /* @__PURE__ */ new Set(["m", "F", "c", "C", "t"]);
var COMMIT_SHORT_ATTACHED = /* @__PURE__ */ new Set(["S", "u"]);
var COMMIT_TAKES_VALUE = /* @__PURE__ */ new Set([
  "-m",
  "-F",
  "-c",
  "-C",
  "-t",
  "--message",
  "--file",
  "--reuse-message",
  "--reedit-message",
  "--template",
  "--author",
  "--date",
  "--fixup",
  "--squash",
  "--trailer",
  "--cleanup",
  "--pathspec-from-file"
]);
function skipsVerify(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") return false;
    if (arg === "--no-verify") return true;
    if (COMMIT_TAKES_VALUE.has(arg)) i++;
    else if (/^-[^-]/.test(arg))
      for (const flag of arg.slice(1)) {
        if (flag === "n") return true;
        if (COMMIT_SHORT_ATTACHED.has(flag)) break;
        if (COMMIT_SHORT_VALUE.has(flag)) {
          if (arg.endsWith(flag)) i++;
          break;
        }
      }
  }
  return false;
}
function gateSkips(facts) {
  const out = [];
  for (const { globals, subcommand, args } of gitCommands(facts)) {
    for (let i = 0; i < globals.length; i++) {
      const global = globals[i];
      const setting = global === "-c" ? globals[++i] ?? "" : global.startsWith("-c") ? global.slice(2) : global.startsWith("--config-env=") ? global.slice(13) : "";
      if (/^core\.hookspath=/i.test(setting)) out.push("`-c core.hooksPath=\u2026` runs git with another hooks folder");
    }
    if (subcommand === "commit" && skipsVerify(args)) out.push("`git commit --no-verify` (or `-n`) skips the commit-msg hook");
    if (subcommand === "commit-tree") out.push("`git commit-tree` writes a commit with no hook");
    if (subcommand === "update-ref") out.push("`git update-ref` moves a ref with no hook");
    if (subcommand === "hash-object" && args.includes("-w")) out.push("`git hash-object -w` writes an object with no hook");
  }
  return out;
}
var noGateSkip = defineCheck(
  (_opts) => (ctx) => {
    const skips = gateSkips(ctx);
    return skips.length === 0 ? ctx.ok() : ctx.fail(skips.join("\n"));
  }
);
var PUSH_TAKES_VALUE = /* @__PURE__ */ new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);
function pushForce(args) {
  let refspecs = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (refspecs || !arg.startsWith("-")) {
      if (arg.startsWith("+")) return `the refspec \`${arg}\``;
      continue;
    }
    if (arg === "--") refspecs = true;
    else if (arg === "--force" || arg === "--force-with-lease" || arg.startsWith("--force-with-lease=") || arg === "--delete") return `\`${arg}\``;
    else if (PUSH_TAKES_VALUE.has(arg)) i++;
    else if (!arg.startsWith("--"))
      for (const flag of arg.slice(1)) {
        if (flag === "f") return arg === "-f" ? "`-f`" : `\`-f\` in \`${arg}\``;
        if (flag === "o") {
          if (arg.endsWith("o")) i++;
          break;
        }
      }
  }
  return null;
}
var noForcePush = defineCheck(
  (_opts) => (ctx) => {
    const found = gitCommands(ctx).flatMap(({ subcommand, args }) => {
      const how = subcommand === "push" ? pushForce(args) : null;
      return how === null ? [] : [`\`git push\` forces the remote with ${how}`];
    });
    return found.length === 0 ? ctx.ok() : ctx.fail(found.join("\n"));
  }
);
var GH_API_METHOD = /^(?:--method(?:=|$)|-i*X=?)(.*)$/;
function apiDeletes(args) {
  return args.includes("api") && args.some((arg, i) => {
    const flag = GH_API_METHOD.exec(arg);
    if (flag === null) return false;
    const value = flag[1] === "" ? args[i + 1] : flag[1];
    return value?.toLowerCase() === "delete";
  });
}
var noDestructiveGh = defineCheck((_opts) => {
  const named = banCommands({ ban: ["gh repo delete", "gh repo archive", "gh repo rename", "gh release delete"] });
  const unparsedApi = banCommands({
    ban: ["gh api -x delete", "gh api -xdelete", "gh api -x=delete", "gh api -ix=delete", "gh api --method delete", "gh api --method=delete"]
  });
  return async (ctx) => {
    const verdict = await named(ctx);
    if (!verdict.ok) return verdict;
    const parsed = shellCommands(ctx);
    if (parsed === null) return unparsedApi({ ...ctx, command: (ctx.command ?? "").toLowerCase() });
    const deletes = parsed.some((c) => programName(c.program) === "gh" && apiDeletes(c.args));
    return deletes ? ctx.fail("`gh api` with the DELETE method") : ctx.ok();
  };
});
function isReleaseCommit(message) {
  const first = message.split("\n")[0] ?? "";
  return /^(release(\([^)]*\))?|chore\([^)]*release[^)]*\))!?:/i.test(first);
}
var VERSION_LINE = /^[+-]?\s*["']?version["']?\s*[:=]\s*["']?(\d+\.\d+\.\d+[^"',\s]*)/;
function changesVersion(diff) {
  const added = [];
  const removed = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    const m = VERSION_LINE.exec(line);
    if (!m?.[1]) continue;
    if (line.startsWith("+")) added.push(m[1]);
    else if (line.startsWith("-")) removed.push(m[1]);
  }
  return added.some((v) => !removed.includes(v));
}
var noHandEditedVersion = defineCheck(
  (opts) => async (ctx) => {
    const message = ctx.message;
    if (message == null) return ctx.ok();
    if (isReleaseCommit(message)) return ctx.ok();
    const diff = await ctx.exec(`git diff --cached -- ${quoteArg(opts.versionFile)}`);
    if (diff.code !== 0) return ctx.ok();
    if (!changesVersion(diff.stdout)) return ctx.ok();
    return ctx.fail(
      `this commit hand-edits the \`version\` field in ${opts.versionFile}. The version is COMPUTED from the commit history at release time \u2014 run \`${opts.recipe}\`, which writes the version, the changelog and the tag together. (A real release commit, headed \`release:\` or \`chore(release):\`, passes.)`
    );
  }
);
var TYPES = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert", "release"];
var TRAILER = ["Co", "Authored", "By"].join("-");
var VENDOR = ["Cl", "aude"].join("");
var SITE = ["cl", "aude", "\\.com/", "cl", "aude", "-code"].join("");
var LINK = ["cl", "aude", ".com/", "cl", "aude", "-code"].join("");
var ROBOT = "\u{1F916}";
var git = definePack("git", (repo) => {
  const versionFile = repo.versionFile ?? "package.json";
  const types = repo.types ?? TYPES;
  return {
    /**
     * Without it, the commit surface is learned by trial and refusal: an agent writes a header the
     * changelog cannot read, reaches for a force push, or discards uncommitted work with a command
     * that has no undo.
     */
    orientation: breadcrumb().at(session).description("The whole commit contract \u2014 how commits are written, how versions are computed, what is blocked.").text(
      [
        `Purpose. This repo's history is Conventional Commits, and the version number is computed from it at release (\`${repo.release}\`). The grammar of a commit header is enforced. Attribution is a ${TRAILER} line, "Generated with Claude" or any mention. To discard edits is \`git checkout\`, \`git restore\`, \`git reset --hard\` or \`git clean -f\` on uncommitted work. To set edits aside is a work-in-progress commit or \`git stash push -m <your label> -- <path>\`. \`gh\` runs under the person's own login, and its destructive calls are refused.`,
        "## Rules",
        "- `GIT-R1` Put no Claude or Anthropic attribution in a commit, a PR or an issue. Author them as your own.",
        "  why: This overrides Claude Code's own attribution reminder.",
        "- `GIT-R2` Write a commit header as `type(scope)!: description`.",
        "- `GIT-R3` Choose the type by judgement: `fix` patches behaviour, `feat` adds it, `refactor` changes neither.",
        "- `GIT-R4` Do not change test expectations in a `refactor`.",
        "- `GIT-R5` Mark a breaking change with `!` or a `BREAKING CHANGE:` footer.",
        "  why: It drives the SemVer major.",
        "- `GIT-R6` Never hand-edit a version field or a changelog.",
        "- `GIT-R7` Commit often.",
        "- `GIT-R8` Before you discard edits, set them aside, never with a plain `git stash`.",
        "  why: Every worktree shares a plain `git stash`.",
        "- `GIT-R9` Single-quote a commit message or a PR or issue body, or feed it on stdin through a quoted heredoc.",
        "  why: The shell runs a backtick inside double quotes before git sees the text."
      ].join("\n")
    ),
    /**
     * Claude Code tells every agent to end a commit or a pull request with a line crediting Claude,
     * and an agent follows the harness's instruction over the repo's. Without this, the credit lands
     * in history, where removing it means rewriting commits that may already be shared.
     */
    noAiAttributionInCommits: guardrail().at(commit).description("Blocks Claude/Anthropic attribution in a commit message.").check(
      commitMessage({
        ban: [
          `[Cc]o-[Aa]uthored-[Bb]y:.*(${VENDOR}|[Aa]nthropic)`,
          `[Gg]enerated with.*${VENDOR}`,
          `${SITE}|\u{1F916} Generated`
        ]
      })
    ).message(
      `The commit message contains Claude or Anthropic attribution. Remove it (the ${TRAILER} line, the 'Generated with Claude' line, any Claude/Anthropic mention) and commit again.`
    ).test({
      pass: [
        { message: "fix(auth): renew the session" },
        // The trailer's name beside no vendor, and a message that only talks about one.
        { message: `fix(auth): renew the session

${TRAILER}: A Person <a@example.com>` },
        { message: `docs(git): the attribution rule bans the ${TRAILER} line` }
      ],
      block: [
        { message: `fix(auth): renew the session

${TRAILER}: ${VENDOR}` },
        { message: `fix(auth): renew the session

${TRAILER}: ${VENDOR} Opus <noreply@anthropic.com>` },
        { message: `fix(auth): renew the session

${TRAILER}: A Tool <noreply@anthropic.com>` },
        // The generated-with line, and the tool's own footer — the site link and the robot emoji.
        { message: `fix(auth): renew the session

Generated with ${VENDOR} Code` },
        { message: `fix(auth): renew the session

${ROBOT} Generated with ${LINK}` }
      ]
    }),
    noForcePush: guardrail().at(command).everywhere().description("Blocks a force-push \u2014 rewriting pushed history is the one loss a stash cannot undo.").check(noForcePush({})).message(
      "Force-push rewrites history that other clones (and every open PR) already have \u2014 the one loss no stash can undo. Push a new commit that corrects the old one. A repo whose workflow genuinely rewrites a scratch remote disables this entry in flow.config.ts, visibly."
    ).test({
      pass: [
        "git push origin main",
        // A heredoc's body is text fed to `cat`, so a push written in it is not one, even where a
        // body line starts with the verb.
        "cat > notes.md <<'EOF'\nnever run git push --force here\nEOF",
        "cat > notes.md <<'EOF'\ngit push --force origin main\nEOF",
        // ONE COMMAND AT A TIME: the flag belongs to the command after the push (#9, #14).
        "git push origin main; ls -f",
        "git push origin HEAD; gh api graphql -f query=x",
        "git push && gh api -f a=b repos/x/y",
        // …and a push named inside another command's argument is not one.
        'echo "never git push -f here"',
        // A value of `-o` is never a flag or a refspec.
        "git push -o +f origin main",
        "git push -of origin main",
        "git push -uo +x origin main",
        "git push --repo +x origin main",
        "git fetch origin +main:main"
      ],
      block: [
        "git push --force origin main",
        // A command line spans newlines, and a body a SHELL reads is commands.
        "git status\ngit push --force origin main",
        "bash <<'EOF'\ngit push --force origin main\nEOF",
        "bash <<< 'git push --force origin main'",
        "git push -f",
        "git push -f origin main",
        "git push -fu origin main",
        "git push --force-with-lease origin main",
        "git push --force-with-lease=main:abc123 origin main",
        "git push origin +main",
        "git push origin -- +HEAD:main",
        // git's own options before `push`, and git run by its path: an agent in a worktree pushes
        // as `git -C <worktree> push`.
        "git -C /x push --force",
        "git --no-pager push -f",
        "/usr/bin/git push --force",
        // A force-push chained behind another command is a command of its own.
        "git status && git push --force origin main"
      ]
    }),
    /**
     * A session runs with no permission prompts and under the person's own GitHub login, so nothing
     * else stands between it and a `gh` command that deletes something for good. A deletion that is
     * wanted is one the person runs themselves.
     */
    noDestructiveGh: guardrail().at(command).everywhere().description("Blocks `gh repo delete`, `archive` and `rename`, `gh release delete`, and `gh api` with the DELETE method.").check(noDestructiveGh({})).message(
      "That `gh` command deletes, archives or moves something on GitHub that other people and clones rely on, and a session never runs it. If it is wanted, ask the person to run it in their own terminal. A repo that lets sessions run it disables this entry in flow.config.ts, visibly."
    ).test({
      pass: [
        "gh repo view",
        "gh repo view me/delete",
        "gh pr create --title x --body y",
        // Deletions outside the five stay allowed, and `delete-asset` is a word of its own.
        "gh issue delete 1",
        "gh gist delete abc",
        "gh release delete-asset v1 a.zip",
        "gh api graphql -f query='mutation { deleteRepository(input: {}) { clientMutationId } }'",
        // `gh api` with another method, or with DELETE as a value and not the method.
        "gh api /repos/a/b",
        "gh api -X GET /repos/a/b",
        "gh api -X POST -f x=DELETE /repos/a/b",
        "gh api -f x=DELETE /repos/a/b",
        "gh api -fX=DELETE /repos/a/b",
        // The method flag means nothing without `api`.
        "gh pr list -X DELETE",
        // A command named in text is no command: a commit message, a heredoc body, a quoted body.
        'git commit -m "docs: never run gh repo delete"',
        'git commit -m "docs: never run gh api -X DELETE /x"',
        "cat > notes.md <<'EOF'\ngh repo delete me/x\ngh api -X DELETE /x\nEOF",
        'gh issue create --title x --body "gh api -X DELETE /x"',
        // The flag belongs to the command after the call.
        "gh api /repos/a/b; curl -X DELETE http://localhost/x",
        // A line that does not parse needs `gh` and the DELETE method among its words.
        "curl api -X DELETE http://x 'unclosed",
        "gh api -X GET /repos/a/b 'unclosed"
      ],
      block: [
        "gh repo delete me/x --yes",
        "gh repo archive me/x",
        "gh repo rename y",
        "gh release delete v1",
        // A call that only names the word is refused: a wrong refusal is cheaper than a wrong pass.
        "gh repo view delete",
        "gh release view delete",
        // Every spelling `gh` accepts, each one seen reaching a server as DELETE.
        "gh api -X DELETE /repos/a/b",
        "gh api -XDELETE /repos/a/b",
        "gh api -X=DELETE /repos/a/b",
        "gh api --method DELETE /repos/a/b",
        "gh api --method=DELETE /repos/a/b",
        "gh api -X delete /repos/a/b",
        "gh api -Xdelete /repos/a/b",
        "gh api --method=delete /repos/a/b",
        "gh api -iX DELETE /repos/a/b",
        "gh api -iXDELETE /repos/a/b",
        // `gh` sends the last method, but a line that names DELETE is not worth reading further.
        "gh api -X DELETE -X GET /repos/a/b",
        // `api` is found anywhere in the arguments, as the other four commands are.
        "gh -X DELETE api /repos/a/b",
        // The program that runs, wherever the line runs it.
        "/opt/homebrew/bin/gh repo delete me/x",
        "/opt/homebrew/bin/gh api -X DELETE /repos/a/b",
        "git status && gh repo delete me/x",
        "sudo gh api -X DELETE /repos/a/b",
        "bash -c 'gh api -X DELETE /repos/a/b'",
        "echo $(gh api -X DELETE /repos/a/b)",
        // A line that does not parse is refused on its words.
        "gh repo delete me/x 'unclosed",
        "gh api -X DELETE /repos/a/b 'unclosed",
        "gh api -XDELETE /repos/a/b 'unclosed",
        "gh api -X=DELETE /repos/a/b 'unclosed",
        "gh api -iX=DELETE /repos/a/b 'unclosed",
        "gh api --method DELETE /repos/a/b 'unclosed",
        "gh api --method=DELETE /repos/a/b 'unclosed",
        "/opt/homebrew/bin/gh api -X Delete /repos/a/b 'unclosed"
      ]
    }),
    /**
     * The commit gate is a hook, and git has ways to commit without running it. A commit made that
     * way holds content no rule judged.
     */
    noGateSkip: guardrail().at(command).description("Blocks a commit the commit gate never runs on \u2014 --no-verify, -n, -c core.hooksPath=\u2026, commit-tree, update-ref, hash-object -w.").check(noGateSkip({})).message(
      "That git command makes a commit, or moves a ref, without the commit gate judging it. Commit normally and fix what the gate refuses. There is no opt-out token; a repo whose workflow needs one of these disables this entry in flow.config.ts, visibly."
    ).test({
      pass: [
        'git commit -m "fix: a thing"',
        "git commit -qam 'fix: a thing'",
        // A message is a value, never a flag, whatever it says.
        "git commit -m '-n is not a flag here'",
        'git commit -m "fix: drop --no-verify from the docs"',
        // Other commands spell -n their own way: a dry run, a line count.
        "git clean -n",
        "git log -n 3",
        "git -c user.name=me commit -m 'fix: a thing'",
        "git hash-object src/a.ts",
        "git push --no-verify"
      ],
      block: [
        "git commit --no-verify -m 'fix: a thing'",
        "git commit -n -m 'fix: a thing'",
        // -n inside a bundle of short flags, and after a commit on the same line.
        "git commit -qanm 'fix: a thing'",
        "git add -A && git commit -nm 'fix: a thing'",
        "git -c core.hooksPath=/dev/null commit -m 'fix: a thing'",
        "git -C ../other -c core.hookspath=.nohooks commit -m 'fix: a thing'",
        // Run from another folder and pointed at this repository: still this repository's commit.
        "cd /tmp && git --git-dir=/r/.git --work-tree=/r commit --no-verify -m 'fix: a thing'",
        "cd /tmp && git --git-dir /r/.git --work-tree /r commit --no-verify -m 'fix: a thing'",
        "cd /tmp && GIT_DIR=/r/.git git commit --no-verify -m 'fix: a thing'",
        "cd /tmp && GIT_WORK_TREE=/r git commit --no-verify -m 'fix: a thing'",
        'git commit-tree HEAD^{tree} -p HEAD -m "fix: a thing"',
        "git update-ref refs/heads/main abc123",
        "echo hi | git hash-object -w --stdin"
      ]
    }),
    conventionalCommitFormat: guardrail().at(commit).description("The commit header must speak Conventional Commits v1.0.0 (checked in git's commit-message hook).").check(commitMessage({ header: `^(${types.map(escapeRe).join("|")})(\\([^)]+\\))?!?: .+` })).message(
      [
        "Commit header must match Conventional Commits v1.0.0: type(scope)!: description \u2014 e.g. `fix(auth): renew session on token refresh`.",
        `The type is one of: ${types.join(" \xB7 ")}.`
      ].join("\n")
    ).test({
      pass: [
        { message: "fix(auth): renew session on token refresh" },
        // The BANG, which is what drives the SemVer major — a scope and a `!` together, since that
        // is the shape a breaking change is actually typed in.
        { message: "feat(cli)!: the config grammar is closed" },
        { message: "fix: a thing\n\nwhy it was needed" }
      ],
      block: [
        { message: "fixed the auth thing" },
        // A known type word with no colon after it. `feat a thing` reads as a sentence that happens
        // to start with a type, and a header regex that only looked for the word would take it.
        { message: "feat a thing" },
        // THE FIRST LINE IS THE HEADER, and the body may say anything at all — including something
        // that looks exactly like a header. A check that searched the whole message would pass this
        // and every other well-meaning commit whose subject was never written.
        { message: "tidied things up\n\nfeat: the thing I actually did" }
      ]
    }),
    node: {
      versionIsSemver: guardrail().at(commit).on(versionFile).description("The manifest's version is valid SemVer 2.0.0 \u2014 the number the computed release writes. See https://semver.org/").check(
        jsonInvariant({
          assert: [
            {
              path: "version",
              matches: "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$"
            }
          ]
        })
      ).message(`\`${versionFile}\` needs a valid SemVer 2.0.0 \`version\` (MAJOR.MINOR.PATCH[-prerelease][+build]).`).test({
        pass: [{ path: versionFile, content: '{"version":"1.2.3"}' }],
        block: [{ path: versionFile, content: '{"version":"1.2"}' }]
      }),
      noHandEditedVersion: guardrail().at(commit).description("The version field is written by the release commit, never by hand.").check(noHandEditedVersion({ versionFile, recipe: repo.release })).message(
        `The version is computed from the commit history at release time \u2014 run \`${repo.release}\`, which writes the version, the changelog and the tag together. A real release commit (\`release:\` / \`chore(release):\`) passes.`
      ).test({
        pass: [
          // A release commit may write it — the one shape that passes with the diff right there.
          { message: "chore(release): 1.2.3", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '-  "version": "1.2.2"\n+  "version": "1.2.3"' } } } },
          // The other two release spellings the header rule accepts, so all three arms are proved
          // rather than the one this repo happens to type.
          { message: "release: 1.2.3", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '-  "version": "1.2.2"\n+  "version": "1.2.3"' } } } },
          { message: "release(flow)!: 2.0.0", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '-  "version": "1.2.2"\n+  "version": "2.0.0"' } } } },
          // A metadata edit that rewrites the version LINE without moving its value — adding a key
          // after it puts a comma on the end. Values are compared, never lines, or this would fire
          // on every reformat.
          { message: "chore: add a field", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '-  "version": "1.2.2"\n+  "version": "1.2.2",' } } } },
          { message: "fix: a thing", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '-  "name": "a"\n+  "name": "b"' } } } },
          // The type word is read case-insensitively: a person typing `Release:` has written a
          // release commit, and refusing it would teach them the rule is about capitalisation.
          { message: "Release: 1.2.3", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '-  "version": "1.2.2"\n+  "version": "1.2.3"' } } } },
          // A `+++` line is the diff's own header naming the file, not a line OF the file — so a
          // path that happens to contain a version-shaped string changes nothing.
          { message: "fix: a thing", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '+++ b/version = "9.9.9"\n--- a/x' } } } },
          // A dependency whose NAME ends in "version" is not the version field: the key is the
          // line's whole first word.
          { message: "feat: a tool", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '+    "commit-and-tag-version": "13.1.2",' } } } }
        ],
        block: [
          { message: "fix: a thing", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '-  "version": "1.2.2"\n+  "version": "1.2.3"' } } } },
          // THE HOLE THIS CASE CLOSED: a bare `chore:` used to read as a release, so every
          // housekeeping commit in the repo was licensed to hand-edit the version. `chore` needs
          // its release scope now, and this case is what keeps it needing one.
          { message: "chore: tidy the readme", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '-  "version": "1.2.2"\n+  "version": "1.2.3"' } } } },
          // A release header in the BODY is not a release commit. The header is line one, the same
          // reading the format rule takes — and a message parser that searched the whole text would
          // hand every commit a free pass by way of a footer.
          { message: "feat: a thing\n\nrelease: 1.2.3", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '-  "version": "1.2.2"\n+  "version": "1.2.3"' } } } },
          // A version ADDED where the file had none: there is no removed value to compare against,
          // and writing the first one by hand is the same act as changing it.
          { message: "chore: add the field", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '+  "version": "0.1.0"' } } } },
          // A prerelease suffix is part of the value, so `1.0.0` → `1.0.0-rc.1` is a change. A
          // comparison that read only the numeric core would wave through every rc a hand cut.
          { message: "fix: a thing", world: { exec: { [`git diff --cached -- '${versionFile}'`]: { stdout: '-  "version": "1.0.0"\n+  "version": "1.0.0-rc.1"' } } } }
        ]
      })
    }
  };
});
export {
  changesVersion,
  gateSkips,
  git,
  isReleaseCommit
};
