import { describe, it, expect } from "vitest";
import { shouldRelease } from "../tools/release-decision.ts";

describe("shouldRelease", () => {
  it("gives no release for docs, refactor and chore", () => {
    expect(shouldRelease(["docs(readme): x", "refactor(core): y", "chore: z", "test: t", "ci: c"])).toBe(false);
    expect(shouldRelease([])).toBe(false);
  });
  it.each([
    ["a fix", "fix(git): a"],
    ["a feat", "feat: b"],
    ["a refactor with !", "refactor!: c"],
    ["a scoped header with !", "chore(deps)!: d"],
    ["a BREAKING CHANGE footer", "refactor: e\n\nbody\n\nBREAKING CHANGE: f is gone"],
  ])("gives a release for %s", (_name, message) => {
    expect(shouldRelease(["docs: x", message])).toBe(true);
  });
  it("is not fooled by a type that only starts with feat or fix", () => {
    expect(shouldRelease(["feature: x", "fixup: y", "docs: mentions BREAKING CHANGE: in prose"])).toBe(false);
  });
});
