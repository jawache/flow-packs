// tools/release-failure.ts — the issue a failed deploy files. Pure: it reads no repo and runs nothing.

/** How many of the last printed lines the issue holds. */
const KEPT_LINES = 40;

/** The issue id in a merge commit's header, from the branch it names (`<id>-<slug>`), or "". */
function issueOf(mergeHeader: string): string {
  return /['/]([a-z][a-z0-9-]*?-\d+)(?:-[^'/]*)?'/.exec(mergeHeader)?.[1] ?? "";
}

/** The title and body of the issue for a deploy whose `step` failed after `printed` lines, `mergeHeader` being the newest merge commit's. */
export function failureIssue(mergeHeader: string, step: string, printed: readonly string[]): { title: string; body: string } {
  const id = issueOf(mergeHeader);
  const last = printed.slice(-KEPT_LINES).join("\n");
  const longest = Math.max(2, ...[...last.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  return {
    title: id === "" ? "The release failed" : `The release after ${id} failed`,
    body: `\`just deploy\` failed at the step \`${step}\`. The last lines it printed:\n\n${fence}\n${last}\n${fence}\n`,
  };
}
