import { describe, expect, it } from "vitest";
import { sample } from "./sample.ts";

describe("sample", () => {
  it("gives one path each glob matches", () => {
    expect(sample("**/*.test.ts")).toBe("a.test.ts");
    expect(sample("**/__tests__/**/*.spec.ts")).toBe("__tests__/a.spec.ts");
    expect(sample(".env*")).toBe(".enva");
    expect(sample(".env.keys")).toBe(".env.keys");
    expect(sample("config/.env.*.local")).toBe("config/.env.a.local");
    expect(sample("src/lib/**")).toBe("src/lib/a");
    expect(sample("**")).toBe("a");
    expect(sample("src/{lib,app}/*.ts")).toBe("src/lib/a.ts");
  });
});
