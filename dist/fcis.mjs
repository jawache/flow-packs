// packs/fcis.ts
import {
  astGrep,
  breadcrumb,
  commit,
  commitReason,
  definePack,
  execPasses,
  guardrail,
  siblingExists,
  symbolsInSibling,
  fileChange
} from "@jawache/flow";
var TESTS = "**/*.test.*";
var asTest = (file) => file.replace(/(\.[^./]+)$/, ".test$1");
var siblingOf = (template, file) => {
  const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ".";
  const base = file.slice(file.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  const name = dot > 0 ? base.slice(0, dot) : base;
  const parts = { dir, base, name, path: dir === "." ? name : `${dir}/${name}` };
  return template.replace(/\{(dir|base|name|path)\}/g, (_, key) => parts[key] ?? "");
};
var fcis = definePack("fcis", (repo) => {
  const sibling = repo.sibling ?? "{dir}/{name}.test.ts";
  const tests = repo.tests ?? TESTS;
  const pure = repo.example;
  const test = siblingOf(sibling, pure);
  return {
    /**
     * Without it, the split is a rule with no model behind it: an agent moves a side effect out of a
     * pure file because a guardrail refused it, learns nothing, and puts the next one back.
     */
    fcis: breadcrumb().at(fileChange).on(...repo.homes).description("The functional-core/imperative-shell mental model, for when you're working in pure-core code.").text(
      [
        'Functional Core, Imperative Shell (Bernhardt, "Boundaries", SCNA 2012).',
        "Decisions live in pure functions, in this repo's declared pure home (see the fcis entries in flow.config.ts): no I/O, no clock, no randomness, no env \u2014 inject them as arguments; determinism IS testability.",
        "The shell is the wiring around the core \u2014 full of functions, but never of decisions: a branch that encodes a rule or a threshold belongs in pure, even if it is currently wrapped in an `await`. Values cross the boundary, never live objects.",
        "The shell is covered by integration tests, not unit tests."
      ].join("\n")
    ),
    // ── separate: the pure side, mechanically ──
    //
    // ast-grep patterns, structural rather than textual: a regex would match `new Date()` inside a
    // string or inside a comment talking ABOUT the ban, which is exactly the false positive that
    // teaches people to ignore a rule.
    noSideEffectsInPure: guardrail().at(commit).on(...repo.files).ignore("**/*.test.ts").description("Pure code performs no I/O and reads no clock, env or randomness \u2014 a structural match, not a regex.").check(
      astGrep({
        language: "typescript",
        rule: {
          any: [
            { pattern: "Date.now()" },
            { pattern: "new Date()" },
            { pattern: "Math.random()" },
            { pattern: "crypto.randomUUID()" },
            { pattern: "crypto.getRandomValues($$$)" },
            { pattern: "fetch($$$)" },
            { pattern: "setTimeout($$$)" },
            { pattern: "setInterval($$$)" },
            { pattern: "process.env" },
            { pattern: "Bun.spawn($$$)" },
            { pattern: "Bun.file($$$)" }
          ]
        }
      })
    ).message(
      [
        "Impurity in the functional core. Pure code takes no clock / randomness / I/O / process.env \u2014 inject them as arguments and keep the decision pure.",
        "  clock   \u2192 new Date() / Date.now()      (accept an injected `now`)",
        "  random  \u2192 Math.random / crypto         (accept an injected id/rng)",
        "  I/O     \u2192 fetch / timers / spawn       (do it in the shell)",
        "  env     \u2192 process.env                  (pass config in)",
        "Move the side effect to the shell and pass the pure input down."
      ].join("\n")
    ).test({
      // `new Date(iso)` is a pure parse of an injected value and passes; `new Date()` reads the
      // system clock and does not. That discrimination is the whole reason this parses.
      pass: [{ path: pure, content: "export const at = (iso: string) => new Date(iso);" }],
      block: [{ path: pure, content: "export const now = () => new Date();" }]
    }),
    noShellInPure: guardrail().at(commit).on(...repo.files).ignore("**/*.test.ts").description("Pure code imports no filesystem, process, socket or OS module \u2014 the leak the call-site rule cannot see.").check(
      astGrep({
        language: "typescript",
        rule: {
          kind: "import_statement",
          has: {
            kind: "string",
            regex: `^["'](node:)?(fs|fs/promises|child_process|net|dns|tls|http|https|http2|os|cluster|worker_threads|readline|repl|v8|vm|zlib|dgram|inspector)["']$`
          }
        }
      })
    ).message(
      [
        "A shell module imported into pure code. The functional core DECIDES; reaching for the filesystem, a process, a socket or the OS is the shell's job, and an import of one is a leak whatever the file then does with it.",
        "  fs \xB7 child_process \xB7 net \xB7 dns \xB7 http(s) \xB7 os \xB7 worker_threads \xB7 cluster",
        "Move the effect into the shell around this file and pass the values in. (`node:path` and `node:url` are string algebra and stay allowed, as does the test runner. Your own modules are fenced by the import-boundaries entry, per repo.)"
      ].join("\n")
    ).test({
      pass: [{ path: pure, content: 'import { join } from "node:path";' }],
      block: [{ path: pure, content: 'import * as fs from "node:fs";' }]
    }),
    noThrowInPure: guardrail().at(commit).on(...repo.files).ignore("**/*.test.ts").description("Pure decisions return errors as values, never throw control flow.").check(astGrep({ language: "typescript", rule: { any: [{ pattern: "throw $X" }, { pattern: "Promise.reject($$$)" }] } })).message(
      "`throw` / Promise.reject in the functional core. Errors are VALUES here \u2014 return a Result / tagged union (ok/err) so the failure path shows in the signature and the caller must handle both arms. Adapt thrown errors to Results at the boundary, not inside pure code."
    ).test({
      pass: [{ path: pure, content: "export const f = () => ({ ok: false as const });" }],
      block: [{ path: pure, content: 'export const f = () => { throw new Error("x"); };' }]
    }),
    // ── test: every pure file is proven ──
    pureHasTest: guardrail().at(commit).on(...repo.files).ignore("**/*.test.ts").description("A pure file has its sibling test \u2014 the test-first artefact exists.").check(siblingExists({ sibling })).message("The pure core is test-first (red \u2192 green): this file's sibling test, named below, is missing. Write the failing test, then the code.").test({
      pass: [{ path: pure, content: "", world: { fs: { [test]: "" } } }],
      block: [{ path: pure, content: "" }]
    }),
    pureExportsTested: guardrail().at(commit).on(...repo.files).ignore("**/*.test.ts").description("Every pure export is at least referenced in its test \u2014 the 'wrote no test' nudge.").check(symbolsInSibling({ sibling })).message(
      "The exports listed below are never named in this file's test. Write a test that uses each one, then write the change again: a reference is enough, as this is a nudge, not coverage."
    ).test({
      pass: [{ path: pure, content: "export const x = 1;", world: { fs: { [test]: "expect(x)" } } }],
      block: [{ path: pure, content: "export const y = 1;", world: { fs: { [test]: "nothing" } } }]
    }),
    pureCovered: guardrail().at(commit).description("Blocks a commit if the pure core's coverage gate fails \u2014 only runs when pure files changed.").check(execPasses({ changed: repo.homes, run: repo.coverage })).message(
      "Coverage of the pure core fell below the bar \u2014 add tests for the new and changed code. (Runs only when pure files changed.)"
    ).test({
      // Nothing pure changed: the gate does not run at all, and a red suite is not this rule's
      // business. That is the `changed` narrowing, and it is what the pass case proves.
      pass: [{ staged: ["README.md"], world: { exec: { [repo.coverage]: { code: 1 } } } }],
      // THE REPO'S OWN PURE FILE, because the narrowing this case exists to prove is the check's
      // own: a path from any other repo falls outside `changed`, is passed correctly, and fails
      // the case.
      block: [{ staged: [repo.example], world: { exec: { [repo.coverage]: { code: 1, stdout: "ERROR: Coverage 91% < 95%" } } } }]
    }),
    // ── the strict-layout family: for repos that name their files by role ──
    //
    // ── comply: growing the pure set costs a sentence ──
    //
    // A new test sibling is expected, never sprawl, so it is exempt — the one thing the old script
    // hard-coded that is visible here.
    newPureFileNeedsReason: guardrail().at(commit).description("A commit adding a non-test file to the pure core must say why the pure file it belongs in isn't the place.").check(
      commitReason({
        whenAdded: repo.files,
        except: [tests],
        token: "new-pure-file"
      })
    ).message(
      "Adding a file to the pure core must say why the pure file it belongs in isn't the place \u2014 put `new-pure-file: <why not the existing file>` on a line of its own in the commit message. The verifier reads that reason at the next phase boundary."
    ).test({
      pass: [
        { message: "feat: x\n\nnew-pure-file: a whole new tier", staged: [repo.example], added: [repo.example] },
        // A new TEST is expected, never sprawl — and the exemption is what this proves, so the
        // path has to be BOTH a pure file and a test.
        { message: "test: cover it", staged: [asTest(repo.example)], added: [asTest(repo.example)] },
        // An EDIT of a pure file is not growth: only a file the last commit does not have owes it.
        { message: "feat: x", staged: [repo.example], added: [] }
      ],
      block: [{ message: "feat: x", staged: [repo.example], added: [repo.example] }]
    })
  };
});
export {
  fcis
};
