// tools/release-decision.ts — is there something to release. Pure: it reads no repo.

/** A commit that deserves a release: a feat, a fix, a `!` in the header, or a BREAKING CHANGE footer. */
function releases(message: string): boolean {
  const header = message.split("\n", 1)[0] ?? "";
  if (/^(feat|fix)(\([^)]*\))?!?:/.test(header)) return true;
  if (/^[a-z]+(\([^)]*\))?!:/.test(header)) return true;
  return /^BREAKING[ -]CHANGE:/m.test(message);
}

/** Whether any of the full commit messages (header and body) since the last tag calls for a release. */
export function shouldRelease(messages: readonly string[]): boolean {
  return messages.some(releases);
}
