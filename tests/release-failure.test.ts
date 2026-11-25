import { describe, expect, it } from "vitest";
import { failureIssue, releaseCutCommand } from "../tools/release-failure.ts";

describe("the issue a failed deploy files", () => {
  it("names the issue in the newest merge's branch", () => {
    const { title } = failureIssue("Merge remote-tracking branch 'origin/flow-packs-4-the-ten-pack-breadcrumbs'", "release", []);
    expect(title).toBe("The release after flow-packs-4 failed");
  });

  it("names none when the header has no id", () => {
    expect(failureIssue("Merge branch 'main' of origin", "release", []).title).toBe("The release failed");
    expect(failureIssue("", "release", []).title).toBe("The release failed");
  });

  it("ends with the last of 200 printed lines, and holds fewer than 200", () => {
    const printed = Array.from({ length: 200 }, (_, i) => `line ${String(i + 1)}`);
    const { body } = failureIssue("", "release-check", printed);
    expect(body).toContain("`release-check`");
    expect(body.trimEnd().endsWith("line 200\n```")).toBe(true);
    expect(body).not.toContain("line 1\n");
    expect(body.split("\n").length).toBeLessThan(200);
  });

  it("fences with more backticks than the output holds", () => {
    const { body } = failureIssue("", "install", ["```", "x"]);
    expect(body).toContain("````\n```\nx\n````");
  });

  it("gives the command to send the release event again, only when there is one", () => {
    const retry = releaseCutCommand("work", "v0.1.1");
    expect(retry).toBe("work event release.cut --package jawache/flow-packs --version v0.1.1");
    expect(failureIssue("", "release.cut", ["no daemon"], retry).body).toContain(`\n\`\`\`sh\n${retry}\n\`\`\`\n`);
    expect(failureIssue("", "push", ["no daemon"]).body).not.toContain("event release.cut");
  });
});
