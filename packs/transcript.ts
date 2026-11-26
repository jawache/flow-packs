// packs/transcript.ts — the line that started a turn, read from a coding agent's transcript.
//
// Pure: it is given a transcript's text, Claude Code's or Codex's, and returns the line that started
// the turn now ending, as typed, such as `[web card 3] go`; `null` when the turn was not started by a
// typed line, or when there is nothing to read. A hold's message, a line typed while the turn runs
// and the rows of a subagent's own conversation never replace the line that started the turn.
//
// Claude Code writes one row for each message. A turn starts at a `user` row with an `origin`: its
// `kind` is `human` for a typed line (`promptSource` `typed`, or `queued` when it waited for the
// previous turn), `peer` for a subagent's report, `task-notification` for a background command. Rows
// a turn goes on with carry no `origin`: a tool's result, a hook's message, a summary. A line typed
// while the turn runs is a `queue-operation` and a `queued_command` attachment, never a `user` row.
//
// Codex starts a turn with a `task_started` event, whose `turn_trigger` is `user` for a typed line,
// and tags each message with its `turn_id`. The line is the first message of that turn whose
// provenance is `user`: the hook's message is `harness`, and a later line typed in the same turn is
// not the first.

/** One row of a transcript: the fields every row of either format has, and the rest as they are. */
type Row = Record<string, unknown>;

/** The rows of a JSONL text: blank lines dropped, a line that does not parse (a torn one) skipped. */
export function jsonl<T>(text: string): T[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const asRow = (value: unknown): Row => (isRow(value) ? value : {});

/** The text of a message's `content`: a string as it is, or the text blocks of a list joined; `null` when there is none. `keep` picks the blocks of a list by index. */
function textOf(content: unknown, keep: (index: number) => boolean = () => true): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const texts = content.flatMap((block, index) => {
    const b = asRow(block);
    return keep(index) && (b.type === "text" || b.type === "input_text") && typeof b.text === "string" ? [b.text] : [];
  });
  return texts.length === 0 ? null : texts.join("\n");
}

/** Claude Code: the last `user` row that starts a turn, and the line when a human typed it. */
function claudeLine(rows: readonly Row[]): string | null {
  const start = rows.findLast((row) => row.type === "user" && row.isSidechain !== true && isRow(row.origin));
  if (start === undefined || asRow(start.origin).kind !== "human") return null;
  return textOf(asRow(start.message).content);
}

/** Codex: the first message a user typed in the turn the last `task_started` opened, when a user started it. */
function codexLine(rows: readonly Row[]): string | null {
  const started = rows.findLastIndex((row) => asRow(row.payload).type === "task_started");
  if (started < 0) return null;
  const attribution = asRow(asRow(rows[started]?.payload).turn_attribution);
  if (attribution.turn_trigger !== "user" || typeof attribution.turn_id !== "string") return null;
  for (const row of rows.slice(started + 1)) {
    const payload = asRow(row.payload);
    if (payload.type !== "message" || payload.role !== "user") continue;
    const meta = asRow(payload.internal_chat_message_metadata_passthrough);
    if (meta.turn_id !== attribution.turn_id) continue;
    const items = Array.isArray(meta.content_item_metadata) ? meta.content_item_metadata : [];
    const typed = (index: number): boolean => asRow(asRow(items[index]).provenance).type === "user";
    const line = textOf(payload.content, typed);
    if (line !== null) return line;
  }
  return null;
}

/** Codex rows are `session_meta`, `event_msg` and `response_item`; Claude Code's are everything else. */
const isCodex = (rows: readonly Row[]): boolean => rows.some((row) => row.type === "session_meta" || row.type === "event_msg" || row.type === "response_item");

/** The line that started the turn now ending, as typed, from a transcript's text; `null` when no typed line started it. */
export function turnStartLine(transcript: string): string | null {
  const rows = jsonl<unknown>(transcript).filter(isRow);
  return isCodex(rows) ? codexLine(rows) : claudeLine(rows);
}
