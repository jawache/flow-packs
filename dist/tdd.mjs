// packs/tdd.ts
import { astGrep, breadcrumb, commit, definePack, execPasses, guardrail, fileChange } from "@jawache/flow";
var TESTS = ["**/*.test.ts", "**/*.test.tsx", "**/*.test.js", "**/*.test.mjs", "**/*.spec.ts", "**/*.spec.tsx", "**/*.spec.js"];
var tdd = definePack("tdd", (repo) => {
  const tests = repo.tests ?? TESTS;
  return {
    /**
     * Without it, testing effort goes where it is easiest to write rather than where confidence is
     * cheapest — a thick unit layer pinned to implementation details, which then refuses every
     * behaviour-preserving refactor.
     */
    testingStrategy: breadcrumb().at(fileChange).on(...tests).description("How to spend testing effort (mostly integration) and what to test (behaviour, not implementation).").text(
      [
        "Spend where confidence-per-cost is highest (the Testing Trophy, Kent C. Dodds): static analysis base, modest unit layer, DOMINANT integration layer, thin e2e cap.",
        "Test behaviour as the user sees it, never implementation details \u2014 if a behaviour-preserving refactor breaks a test, the test was wrong.",
        "Mock only at owned boundaries: the network edge (MSW), not your own modules."
      ].join("\n")
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
    vitest: guardrail().at(commit).on(...tests).description("The fleet runs vitest \u2014 a second framework in a test file is a suite nothing here can check.").check(
      astGrep({
        language: "typescript",
        rule: {
          kind: "import_statement",
          has: {
            kind: "string",
            regex: `^["'](node:test|node:assert|node:assert/strict|jest|@jest/globals|mocha|jasmine|ava|tap|tape|uvu)["']$`
          }
        }
      })
    ).message(
      [
        'A second test framework in a test file. This fleet runs vitest \u2014 every idiom rule below reads vitest spellings, so a file under another runner is a file nothing here can check, and a suite that only one command knows how to run. Import `test` / `expect` / `describe` / `vi` from "vitest".',
        "A repo that genuinely runs another framework disables this entry in its config, on the record, rather than mixing two."
      ].join("\n")
    ).test({
      pass: [{ path: "a.test.ts", content: 'import { test, expect } from "vitest";' }],
      block: [{ path: "a.test.ts", content: 'import { test } from "node:test";' }]
    }),
    vitestIdioms: {
      noMockInternal: guardrail().at(commit).on(...tests).description("Mock at owned boundaries only \u2014 never your own modules.").check(
        astGrep({
          language: "typescript",
          rule: {
            kind: "call_expression",
            all: [
              { has: { field: "function", regex: "^vi\\.mock$" } },
              { has: { kind: "arguments", has: { kind: "string", regex: `^['"]\\.` } } }
            ]
          }
        })
      ).message(
        "Module-mocking your own code (a relative import). This pins the test to the file layout and skips the real integration \u2014 test behaviour through the public surface and mock at the boundary you own instead (network \u2192 MSW; clock/random \u2192 inject)."
      ).test({
        pass: [{ path: "a.test.ts", content: 'vi.mock("axios");' }],
        block: [{ path: "a.test.ts", content: 'vi.mock("./neighbour.ts");' }]
      }),
      noOnlyInTests: guardrail().at(commit).on(...tests).description("A committed `.only` silently disables the rest of the suite.").check(astGrep({ language: "tsx", rule: { kind: "call_expression", has: { field: "function", regex: "\\.only$" } } })).message(
        "A focused test (.only) silently skips the rest of the suite \u2014 CI goes green while nothing runs. Remove the focus before you commit."
      ).test({
        pass: [{ path: "a.test.ts", content: 'it("works", () => { expect(1).toBe(1); });' }],
        block: [{ path: "a.test.ts", content: 'it.only("works", () => { expect(1).toBe(1); });' }]
      }),
      noNetworkStubs: guardrail().at(commit).on(...tests).description("Stubbing fetch or mocking an HTTP client tests the stub; intercept at the network edge instead.").check(
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
                  { has: { kind: "arguments", has: { kind: "string", regex: `^['"](axios|node-fetch|got|ky|undici)['"]$` } } }
                ]
              }
            ]
          }
        })
      ).message(
        "Hand-rolled network stub. Mock at the network boundary with MSW (Testing Trophy: mock only what you own \u2014 the edge, not the client), so request building, serialisation and error mapping stay under test."
      ).test({
        pass: [{ path: "a.test.ts", content: 'server.use(http.get("/x", () => HttpResponse.json({})));' }],
        block: [{ path: "a.test.ts", content: "global.fetch = vi.fn();" }]
      }),
      noEmptyTest: guardrail().at(commit).on(...tests).description("A test with no assertions is a green light for nothing.").check(
        astGrep({
          language: "tsx",
          rule: {
            any: [
              { pattern: "it($DESC, () => {})" },
              { pattern: "it($DESC, async () => {})" },
              { pattern: "test($DESC, () => {})" },
              { pattern: "test($DESC, async () => {})" }
            ]
          }
        })
      ).message(
        "Empty test body \u2014 it passes forever and counts as coverage. Write the assertion, or be honest with `it.todo('\u2026')` until you do."
      ).test({
        pass: [{ path: "a.test.ts", content: 'it.todo("covers the retry path");' }],
        block: [{ path: "a.test.ts", content: 'it("covers the retry path", () => {});' }]
      })
    },
    commitRunsTests: guardrail().at(commit).description("Runs the deterministic suite at commit and blocks if anything fails.").check(execPasses({ run: repo.run })).message("The commit suite failed \u2014 the commit is blocked until it is green. (Run it yourself to see what broke.)").test({
      pass: [{ staged: ["cli/a.ts"], world: { exec: { [repo.run]: { code: 0 } } } }],
      block: [{ staged: ["cli/a.ts"], world: { exec: { [repo.run]: { code: 1, stdout: "1 failed" } } } }]
    })
  };
});
export {
  tdd
};
