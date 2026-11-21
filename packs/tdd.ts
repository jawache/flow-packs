// packs/tdd.ts — the testing discipline.
// Subtlety: the sibling-test trio lives in `fcis`, not here; `commitRunsTests` takes the suite recipe as a mandatory parameter rather than defaulting to `just test`.
//
// The sibling-test machinery (hasTest · exportsTested · coverageGate) is NOT here — `fcis` owns
// the trio, scoped to the pure homes it is handed as a parameter. The ruling and its reasons are
// written at the trio's old spot below, where whoever comes looking for it will land.

import { astGrep, breadcrumb, commit, definePack, execPasses, guardrail, fileChange } from "@jawache/flow";
import { sample } from "./sample.ts";

/** The test-file spellings the idiom rules watch when a repo names none of its own. */
const TESTS = ["**/*.test.ts", "**/*.test.tsx", "**/*.test.js", "**/*.test.mjs", "**/*.spec.ts", "**/*.spec.tsx", "**/*.spec.js"];

/** What this pack cannot know: the suite recipe, and how this repo spells a test file. */
export interface Suite {
  /**
   * The recipe that runs the deterministic suite — for example `just test-commit` or `npm test`.
   *
   * MANDATORY rather than defaulted: which command is the gate is a repo's fact, and a default is
   * a rule that runs the wrong suite in every repo whose gate has another name.
   */
  readonly run: string;

  /**
   * Every spelling of a test file. Defaults to the seven this fleet uses — `.test.` and `.spec.`
   * with `.ts`, `.tsx`, `.js` and `.mjs`.
   *
   * The strategy breadcrumb fires on them and the four `vitestIdioms` rules judge them, so a repo
   * that keeps its tests in `__tests__/` names that here rather than re-scoping five entries.
   */
  readonly tests?: readonly string[];
}

/**
 * Test-first artefacts exist; tests test behaviour, not implementation; the suite gates the commit.
 *
 * `commitRunsTests` takes the suite recipe as a mandatory PARAMETER rather than defaulting to
 * `just test`: which command is the deterministic gate is a repo's fact, and a default is a rule
 * that runs the wrong suite in every repo whose gate has another name.
 *
 * The `vitest/` sub-group holds FRAMEWORK spellings rather than testing principles: a repo on
 * another runner disables the four of them without losing the artefacts or the gate.
 *
 * @install vitest, unless the four `vitestIdioms` entries are disabled — every one of them reads a
 * vitest spelling.
 * @setup One recipe that runs the deterministic suite, named as the `run` parameter. It is what
 * the commit gate runs, so it has to be the whole suite and it has to be green.
 * @adopt A repo on another runner binds the pack and disables `vitest` and the `vitestIdioms`
 * group by name, keeping the strategy breadcrumb and the commit gate — that split is why the
 * framework rules are a sub-group rather than four loose entries.
 */
export const tdd = definePack("tdd", (repo: Suite) => {
  const tests = repo.tests ?? TESTS;
  // A test file every rule on `tests` is asked about, in this repo's own spelling.
  const testFile = sample(tests[0] ?? "a.test.ts");
  return {
    /**
     * Without it, a test goes where it is easiest to write rather than on the lowest rung that proves
     * it — logic proved by starting a program or a browser, a new end-to-end test where an existing
     * one should gain a step, and tests pinned to implementation details.
     */
    testingStrategy: breadcrumb()
      .at(fileChange)
      .on(...tests)
      .description("Which test proves what (the lowest rung that proves it) and what to test (behaviour, not implementation).")
      .text(
        [
          "Purpose. A test goes on the lowest rung that proves it: no test, a unit test, an integration test, a step in an existing end-to-end test, a new end-to-end test. Logic is what code works out from its inputs: a string it builds, an order it sorts into, a value it parses. An end-to-end test follows one path a person takes through the product, across a process boundary, such as a click in a browser that changes what is stored.",
          "## Rules",
          "- `TDD-R1` Put a test on the lowest rung that proves it, and be able to say why the rung below cannot.",
          "- `TDD-R2` Write no test when another test already fails if this breaks, when the code has no logic, or when a compiler, a linter or a guardrail already holds it.",
          "- `TDD-R3` Prove logic with a unit test, once. Never prove it again in an integration test or an end-to-end test.",
          "- `TDD-R4` If the logic sits in code that starts a program, reads a file or calls the network, move the logic into a pure function first, then unit test the function.",
          "- `TDD-R5` Write one integration test for each call to a real program, to prove what is passed to it and what comes back.",
          "- `TDD-R6` Use an end-to-end test only for what two processes must agree on, which no unit test and integration test together can prove.",
          "- `TDD-R7` When the product gains a behaviour on a path an end-to-end test already follows, add a step to that test. Do not write a new test.",
          "- `TDD-R8` Ask the human before you add a new end-to-end test.",
          "- `TDD-R9` Wait on a condition, never on the clock.",
          "- `TDD-R10` To test that something does not happen, keep checking for a named length of time, and fail if it ever does.",
          "- `TDD-R11` Test behaviour as the user sees it, never implementation details.",
          "  why: If a behaviour-preserving refactor breaks a test, the test was wrong.",
          "- `TDD-R12` Mock only at boundaries you own, such as the network edge (MSW). Never mock your own modules.",
        ].join("\n"),
      ),

    // THE SIBLING-TEST TRIO IS NOT HERE, and that is a ruling rather than an omission.
    //
    // `hasTest` · `exportsTested` · `coverageGate` used to ship in this pack, unscoped and disabled,
    // for a repo that tests everything but rejects FCIS. This repo is not that repo: it runs FCIS,
    // and `fcis` owns all three — scoped to the pure homes it is handed as a parameter, live, and
    // proving something. Defining them twice meant one live triple and one dead one wearing its
    // shape, and the dead one's only remaining function was to be explained to whoever found it.
    //
    // A repo that genuinely wants the generic family adds it to this pack with its own file set.
    // Until one does, there is nothing here to keep true.

    vitest: guardrail()
      .at(commit)
      .on(...tests)
      .description("The fleet runs vitest — a second framework in a test file is a suite nothing here can check.")
      .check(
        astGrep({
          language: "typescript",
          rule: {
            kind: "import_statement",
            has: {
              kind: "string",
              regex: "^[\"'](node:test|node:assert|node:assert/strict|jest|@jest/globals|mocha|jasmine|ava|tap|tape|uvu)[\"']$",
            },
          },
        }),
      )
      .message(
        [
          'A second test framework in a test file. This fleet runs vitest — every idiom rule below reads vitest spellings, so a file under another runner is a file nothing here can check, and a suite that only one command knows how to run. Import `test` / `expect` / `describe` / `vi` from "vitest".',
          "A repo that genuinely runs another framework disables this entry in its config, on the record, rather than mixing two.",
        ].join("\n"),
      )
      .test({
        pass: [{ path: testFile, content: 'import { test, expect } from "vitest";' }],
        block: [{ path: testFile, content: 'import { test } from "node:test";' }],
      }),

    vitestIdioms: {
      noMockInternal: guardrail()
        .at(commit)
        .on(...tests)
        .description("Mock at owned boundaries only — never your own modules.")
        .check(
          astGrep({
            language: "typescript",
            rule: {
              kind: "call_expression",
              all: [
                { has: { field: "function", regex: "^vi\\.mock$" } },
                { has: { kind: "arguments", has: { kind: "string", regex: "^['\"]\\." } } },
              ],
            },
          }),
        )
        .message(
          "Module-mocking your own code (a relative import). This pins the test to the file layout and skips the real integration — test behaviour through the public surface and mock at the boundary you own instead (network → MSW; clock/random → inject).",
        )
        .test({
          pass: [{ path: testFile, content: 'vi.mock("axios");' }],
          block: [{ path: testFile, content: 'vi.mock("./neighbour.ts");' }],
        }),

      noOnlyInTests: guardrail()
        .at(commit)
        .on(...tests)
        .description("A committed `.only` silently disables the rest of the suite.")
        .check(astGrep({ language: "tsx", rule: { kind: "call_expression", has: { field: "function", regex: "\\.only$" } } }))
        .message(
          "A focused test (.only) silently skips the rest of the suite — CI goes green while nothing runs. Remove the focus before you commit.",
        )
        .test({
          pass: [{ path: testFile, content: 'it("works", () => { expect(1).toBe(1); });' }],
          block: [{ path: testFile, content: 'it.only("works", () => { expect(1).toBe(1); });' }],
        }),

      noNetworkStubs: guardrail()
        .at(commit)
        .on(...tests)
        .description("Stubbing fetch or mocking an HTTP client tests the stub; intercept at the network edge instead.")
        .check(
          astGrep({
            language: "tsx",
            rule: {
              any: [
                { pattern: "global.fetch = $X" },
                { pattern: "globalThis.fetch = $X" },
                {
                  kind: "call_expression",
                  all: [
                    { has: { field: "function", regex: "^vi\\.mock$" } },
                    { has: { kind: "arguments", has: { kind: "string", regex: "^['\"](axios|node-fetch|got|ky|undici)['\"]$" } } },
                  ],
                },
              ],
            },
          }),
        )
        .message(
          "Hand-rolled network stub. Mock at the network boundary with MSW (Testing Trophy: mock only what you own — the edge, not the client), so request building, serialisation and error mapping stay under test.",
        )
        .test({
          pass: [{ path: testFile, content: 'server.use(http.get("/x", () => HttpResponse.json({})));' }],
          block: [{ path: testFile, content: "global.fetch = vi.fn();" }],
        }),

      noEmptyTest: guardrail()
        .at(commit)
        .on(...tests)
        .description("A test with no assertions is a green light for nothing.")
        .check(
          astGrep({
            language: "tsx",
            rule: {
              any: [
                { pattern: "it($DESC, () => {})" },
                { pattern: "it($DESC, async () => {})" },
                { pattern: "test($DESC, () => {})" },
                { pattern: "test($DESC, async () => {})" },
              ],
            },
          }),
        )
        .message(
          "Empty test body — it passes forever and counts as coverage. Write the assertion, or be honest with `it.todo('…')` until you do.",
        )
        .test({
          pass: [{ path: testFile, content: 'it.todo("covers the retry path");' }],
          block: [{ path: testFile, content: 'it("covers the retry path", () => {});' }],
        }),
    },

    commitRunsTests: guardrail()
      .at(commit)
      .description("Runs the deterministic suite at commit and blocks if anything fails.")
      .check(execPasses({ run: repo.run }))
      .message("The commit suite failed — the commit is blocked until it is green. (Run it yourself to see what broke.)")
      .test({
        pass: [{ staged: ["cli/a.ts"], world: { exec: { [repo.run]: { code: 0 } } } }],
        block: [{ staged: ["cli/a.ts"], world: { exec: { [repo.run]: { code: 1, stdout: "1 failed" } } } }],
      }),
  };
});
