// packs/node.ts
import { breadcrumb, commit, commitReason, defineCheck, definePack, guardrail, fileChange } from "@jawache/flow";
var DEP_BLOCKS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "overrides"];
var LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "bun.lock", "bun.lockb", "yarn.lock"];
var ADDS_ZOD = { "git show HEAD:package.json": { stdout: "{}" }, "git show :package.json": { stdout: '{"dependencies":{"zod":"1.0.0"}}' } };
var STAMPS_VERSION = { "git show HEAD:package.json": { stdout: '{"version":"1.2.2"}' }, "git show :package.json": { stdout: '{"version":"1.2.3"}' } };
function movedDependencies(beforeText, afterText) {
  let before;
  let after;
  try {
    before = beforeText.trim() === "" ? {} : JSON.parse(beforeText);
    after = afterText.trim() === "" ? {} : JSON.parse(afterText);
  } catch {
    return ["(package.json is not parseable JSON on one side of this commit)"];
  }
  const moved = [];
  for (const block of DEP_BLOCKS) {
    const a = before[block] ?? {};
    const b = after[block] ?? {};
    for (const name of /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)]))
      if (JSON.stringify(a[name]) !== JSON.stringify(b[name]) && !moved.includes(name)) moved.push(name);
  }
  return moved;
}
async function movedInCommit(ctx) {
  const [head, index] = await Promise.all([ctx.exec("git show HEAD:package.json"), ctx.exec("git show :package.json")]);
  return movedDependencies(head.code === 0 ? head.stdout : "", index.code === 0 ? index.stdout : "");
}
var reasonForMovedDependency = defineCheck(
  (_opts) => async (ctx) => {
    if (!(ctx.staged ?? []).includes("package.json")) return ctx.ok();
    if ((await movedInCommit(ctx)).length === 0) return ctx.ok();
    return commitReason({ whenChanged: ["package.json"], token: "new-dep" })(ctx);
  }
);
var lockfileInStep = defineCheck(
  (_opts) => async (ctx) => {
    const staged = ctx.staged ?? [];
    if (!staged.includes("package.json")) return ctx.ok();
    if (staged.some((f) => LOCKFILES.includes(f))) return ctx.ok();
    const moved = await movedInCommit(ctx);
    if (moved.length === 0) return ctx.ok();
    return ctx.fail(`this commit moves ${moved.map((d) => `\`${d}\``).join(", ")} in package.json but stages no lockfile`);
  }
);
var node = definePack("node", {
  /**
   * Without it, the reflex is to hand-roll rather than to look, and a repo accumulates private
   * versions of solved problems — code with no users, no reviewers and no fixes coming.
   */
  dependencies: breadcrumb().at(fileChange).on("package.json", ...LOCKFILES).description("When to reach for a package, how to vet it, and what a commit that adds one owes.").text(
    [
      "Before building it, check whether it's been solved: a maintained package that does the job beats hand-rolled code \u2014 ours has no users, no reviewers and no fixes coming.",
      "When you DO add one, vet it: is it alive \u2014 downloads, recent releases, active issues? Most-downloaded isn't the bar (a newer, trending package can be the right call); the red flag is a package nobody uses and nobody maintains \u2014 that is the supply-chain risk (OWASP A03).",
      "Adding a dependency is a decision that carries its reasoning: put `new-dep: <name> \u2014 <why, what else was checked>` on a line of its own in the commit message; the rule blocks a bare addition.",
      "Pin the version; the lockfile change ships in the SAME commit."
    ].join("\n")
  ),
  // The condition is the dependency sections, not the file: a pin change is a supply-chain decision
  // on the same grounds as an addition, and `overrides` is one of the sections. A commit that edits
  // the rest of package.json, such as a release's version stamp, owes no line.
  /**
   * Without it, a dependency arrives with no record of what else was considered, and the next
   * person to ask "why do we depend on this" has only the package name to go on.
   */
  newDependencyNeedsReason: guardrail().at(commit).description("A commit that moves a dependency in package.json must record why, and what else was checked.").check(reasonForMovedDependency({})).message(
    "This commit moves a dependency in package.json and its message records no reason. Put `new-dep: <name> \u2014 <why, and what else was checked>` on a line of its own in the message. If the package.json change belongs to another commit, take it out of this one."
  ).test({
    pass: [
      { message: "feat: x\n\nnew-dep: zod \u2014 checked ajv", staged: ["package.json"], world: { exec: ADDS_ZOD } },
      { message: "feat: x", staged: ["src/a.ts"] },
      // The release's version stamp: package.json changes, no dependency does.
      { message: "chore(release): 1.2.3", staged: ["package.json"], world: { exec: STAMPS_VERSION } },
      // A section the list names is not the only thing a commit may change beside it.
      { message: "feat: x", staged: ["package.json"], world: { exec: { "git show HEAD:package.json": { stdout: '{"scripts":{"a":"x"}}' }, "git show :package.json": { stdout: '{"scripts":{"a":"y"}}' } } } }
    ],
    block: [
      { message: "feat: x", staged: ["package.json"], world: { exec: ADDS_ZOD } },
      // An override is a dependency decision too.
      { message: "feat: x", staged: ["package.json"], world: { exec: { "git show HEAD:package.json": { stdout: '{"overrides":{"a":{"b":"1"}}}' }, "git show :package.json": { stdout: '{"overrides":{"a":{"b":"2"}}}' } } } }
    ]
  }),
  // Keyed on the dependency BLOCKS, not on the file: a repository.url fix moves no lockfile, and
  // the file-keyed version blocked exactly that commit (2026-08-13).
  /**
   * Without it, a dependency moves in one commit and the lockfile in another (or never), so a
   * fresh clone installs something nobody tested and the two files disagree about what this repo
   * depends on.
   */
  lockfileInStep: guardrail().at(commit).description("A dependency move and the lockfile land in the same commit \u2014 deps stay exactly pinned.").check(lockfileInStep({})).message(
    "A dependency moved in package.json but no lockfile is staged. Run the install and stage the lockfile in the same commit \u2014 a lockfile one commit behind is a build that resolves differently on the next machine."
  ).test({
    pass: [
      { staged: ["src/a.ts"] },
      {
        staged: ["package.json", "package-lock.json"],
        world: { exec: { "git show HEAD:package.json": { stdout: "{}" }, "git show :package.json": { stdout: "{}" } } }
      },
      {
        // A metadata-only edit: nothing for a lockfile to mirror.
        staged: ["package.json"],
        world: {
          exec: {
            "git show HEAD:package.json": { stdout: '{"name":"a","dependencies":{"zod":"1.0.0"}}' },
            "git show :package.json": { stdout: '{"name":"b","dependencies":{"zod":"1.0.0"}}' }
          }
        }
      }
    ],
    block: [
      {
        staged: ["package.json"],
        world: {
          exec: {
            "git show HEAD:package.json": { stdout: '{"dependencies":{"zod":"1.0.0"}}' },
            "git show :package.json": { stdout: '{"dependencies":{"zod":"2.0.0"}}' }
          }
        }
      },
      // Unparseable on one side. A package.json being reshaped into something else is a change
      // no comparison can rule out, so it blocks rather than waving through — the safe direction
      // for a rule about a lockfile going one commit stale.
      {
        staged: ["package.json"],
        world: {
          exec: {
            "git show HEAD:package.json": { stdout: '{"dependencies":{"zod":"1.0.0"}}' },
            "git show :package.json": { stdout: "{ not json at all" }
          }
        }
      },
      // ADDED and REMOVED, not just re-pinned. The case above compares two versions of the same
      // name, which a comparison keyed on the version string alone would also pass; these two are
      // what say the comparison is over the SET.
      {
        staged: ["package.json"],
        world: {
          exec: {
            "git show HEAD:package.json": { stdout: "{}" },
            "git show :package.json": { stdout: '{"dependencies":{"zod":"1.0.0"}}' }
          }
        }
      },
      {
        staged: ["package.json"],
        world: {
          exec: {
            "git show HEAD:package.json": { stdout: '{"dependencies":{"zod":"1.0.0"}}' },
            "git show :package.json": { stdout: "{}" }
          }
        }
      },
      // ALL FOUR BLOCKS, one case each. A lockfile mirrors every one of them, and a list that
      // quietly dropped a block would leave that block's moves unwatched while the rule still
      // read as armed — so each is driven on its own rather than four at once, where three
      // passing and one missing is the same green.
      {
        staged: ["package.json"],
        world: {
          exec: {
            "git show HEAD:package.json": { stdout: '{"devDependencies":{"vitest":"1.0.0"}}' },
            "git show :package.json": { stdout: '{"devDependencies":{"vitest":"2.0.0"}}' }
          }
        }
      },
      {
        staged: ["package.json"],
        world: {
          exec: {
            "git show HEAD:package.json": { stdout: "{}" },
            "git show :package.json": { stdout: '{"peerDependencies":{"react":"^19"}}' }
          }
        }
      },
      {
        staged: ["package.json"],
        world: {
          exec: {
            "git show HEAD:package.json": { stdout: "{}" },
            "git show :package.json": { stdout: '{"optionalDependencies":{"fsevents":"^2"}}' }
          }
        }
      },
      // A name moved BETWEEN blocks — dev to prod is the usual direction, and it is a real move:
      // the lockfile records which tree a package belongs to, so it has to follow.
      {
        staged: ["package.json"],
        world: {
          exec: {
            "git show HEAD:package.json": { stdout: '{"devDependencies":{"zod":"1.0.0"}}' },
            "git show :package.json": { stdout: '{"dependencies":{"zod":"1.0.0"}}' }
          }
        }
      },
      // A package.json that did not exist on the other side at all: `git show HEAD:` fails, and
      // an absent file reads as an empty one, so every dependency in the new file is new.
      {
        staged: ["package.json"],
        world: {
          exec: {
            "git show HEAD:package.json": { code: 128, stderr: "path does not exist in HEAD" },
            "git show :package.json": { stdout: '{"dependencies":{"zod":"1.0.0"}}' }
          }
        }
      }
    ]
  })
});
export {
  movedDependencies,
  node
};
