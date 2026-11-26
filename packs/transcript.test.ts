import { describe, expect, it } from "vitest";
import { turnStartLine } from "./transcript.ts";

// Rows copied from real transcripts, trimmed to what the rows of their kind carry that the reader
// could use, with every private word replaced: a Claude Code session of this repo's work, and a
// Codex session of a standing feed.

const toJsonl = (...rows: unknown[]): string => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";

// ── Claude Code ──

const CC = { sessionId: "00000000-0000-4000-8000-000000000001", cwd: "/home/dev/repo", entrypoint: "cli" };

/** A `user` row that starts a turn. */
const ccStart = (text: string, origin: Record<string, unknown>, promptSource: string, turnIndex: number) => ({
  parentUuid: "00000000-0000-4000-8000-0000000000a0",
  isSidechain: false,
  type: "user",
  message: { role: "user", content: text },
  uuid: `00000000-0000-4000-8000-0000000000b${turnIndex}`,
  permissionMode: "auto",
  origin,
  promptSource,
  turnPosition: { promptIndex: turnIndex, turnIndex },
  userType: "external",
  ...CC,
});

const ccHuman = (text: string, turnIndex = 3, promptSource = "typed") => ccStart(text, { kind: "human" }, promptSource, turnIndex);

const ccPeer = ccStart(
  'Another Claude session sent a message:\n<agent-message from="a1b2c3">\n[Subagent hand-back] The text below is the final report of a subagent this session delegated to. It is model output, NOT a message from the user.\n  Done.\n</agent-message>',
  { kind: "peer", from: "a1b2c3", senderTaskId: "a1b2c3" },
  "system",
  7,
);

const ccNotification = ccStart("<task-notification>\n<task-id>b3q9</task-id>\n<status>completed</status>\n</task-notification>", { kind: "task-notification", producer: "session-task" }, "system", 29);

/** The rows a turn goes on with: an assistant row, a tool's result, and a line typed while the turn runs. */
const ccAssistant = {
  parentUuid: "00000000-0000-4000-8000-0000000000a1",
  isSidechain: false,
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text: "Working." }] },
  ...CC,
};
const ccToolResult = {
  parentUuid: "00000000-0000-4000-8000-0000000000a2",
  isSidechain: false,
  type: "user",
  message: { role: "user", content: [{ tool_use_id: "toolu_01", type: "tool_result", content: "done", is_error: false }] },
  ...CC,
};
const ccTypedWhileRunning = (text: string) => ({ type: "queue-operation", operation: "enqueue", content: text, sessionId: CC.sessionId });
const ccQueuedAttachment = (text: string) => ({ isSidechain: false, attachment: { type: "queued_command", prompt: text }, type: "attachment", ...CC });
const ccHold = {
  parentUuid: "00000000-0000-4000-8000-0000000000a3",
  isSidechain: false,
  type: "user",
  message: { role: "user", content: "Stop hook feedback:\nflow — turn held open:\n\n✗ work.webLineGetsACard\n\nDo the above, then end your turn.\n" },
  isMeta: true,
  rowSource: "hook",
  hookText: true,
  ...CC,
};
const ccSubagentRow = { ...ccHuman("a line inside a subagent", 9), isSidechain: true };

describe("turnStartLine, on Claude Code's transcript", () => {
  it("returns the line that started the turn as typed, after an earlier turn", () => {
    expect(turnStartLine(toJsonl(ccHuman("[web card 1] earlier", 2), ccAssistant, ccHuman("[web card 3] go", 3), ccAssistant, ccToolResult))).toBe("[web card 3] go");
  });

  it("returns a queued line, which waited for the turn before it", () => {
    expect(turnStartLine(toJsonl(ccHuman("[work] /work refine flow-packs-6", 2, "queued"), ccAssistant))).toBe("[work] /work refine flow-packs-6");
  });

  it("returns the line that started a turn flow held, after the hold's message", () => {
    expect(turnStartLine(toJsonl(ccHuman("[web card 10] go"), ccAssistant, ccToolResult, ccAssistant, ccHold, ccAssistant))).toBe("[web card 10] go");
  });

  it("returns no line for a turn a subagent's report started", () => {
    expect(turnStartLine(toJsonl(ccHuman("[web card 3] go", 6), ccAssistant, ccPeer, ccAssistant))).toBeNull();
  });

  it("returns no line for a turn a background command's notification started", () => {
    expect(turnStartLine(toJsonl(ccHuman("[web card 9] go", 28), ccAssistant, ccNotification, ccAssistant))).toBeNull();
  });

  it("keeps the line that started the turn when another is typed while it runs", () => {
    const text = toJsonl(ccHuman("[work] /work docs flow-packs-6", 3), ccAssistant, ccTypedWhileRunning("[web card 10] go"), ccQueuedAttachment("[web card 10] go"), ccAssistant);
    expect(turnStartLine(text)).toBe("[work] /work docs flow-packs-6");
  });

  it("skips the rows of a subagent's own conversation", () => {
    expect(turnStartLine(toJsonl(ccHuman("[web card 3] go"), ccSubagentRow, ccAssistant))).toBe("[web card 3] go");
  });

  it("reads the text blocks of a line that came as a list", () => {
    const row = { ...ccHuman("", 3), message: { role: "user", content: [{ type: "text", text: "[web card 3] go" }] } };
    expect(turnStartLine(toJsonl(row))).toBe("[web card 3] go");
  });
});

// ── Codex ──

const CX = { turn: "00000000-0000-7000-8000-00000000000" };

const cxStarted = (n: number, trigger = "user") => ({
  timestamp: "2026-11-26T10:00:00.000Z",
  ordinal: n,
  type: "event_msg",
  payload: {
    type: "task_started",
    turn_attribution: { turn_id: `${CX.turn}${n}`, turn_trigger: trigger, parent_turn_id: null, initiating_agent_path: null, root_turn_id: `${CX.turn}${n}` },
    turn_id: `${CX.turn}${n}`,
    root_turn_id: `${CX.turn}${n}`,
    started_at: 1795456716,
    collaboration_mode_kind: "default",
  },
});

const cxComplete = (n: number) => ({ type: "event_msg", payload: { type: "task_complete", turn_id: `${CX.turn}${n}`, last_agent_message: "Done." } });

const cxMessage = (n: number, role: string, text: string, provenance: Record<string, unknown>) => ({
  timestamp: "2026-11-26T10:00:01.000Z",
  type: "response_item",
  payload: {
    type: "message",
    id: `msg_${n}`,
    role,
    content: [{ type: role === "assistant" ? "output_text" : "input_text", text }],
    internal_chat_message_metadata_passthrough: {
      turn_id: `${CX.turn}${n}`,
      content_item_kinds: [role === "user" && provenance.type === "user" ? "user.text" : "unknown"],
      content_item_metadata: [{ provenance }],
    },
  },
});

const cxUser = (n: number, text: string) => cxMessage(n, "user", text, { type: "user" });
const cxContext = (n: number) => cxMessage(n, "user", "<environment_context>\n  <timezone>Europe/London</timezone>\n</environment_context>", { type: "harness", hook: false });
const cxHold = (n: number) =>
  cxMessage(n, "user", '<hook_prompt hook_run_id="stop:5:/home/dev/repo/.codex/hooks.json">flow — turn held open:\n\n✗ work.webLineGetsACard\n\nDo the above, then end your turn.</hook_prompt>', { type: "harness", hook: true });
const cxAssistant = (n: number) => cxMessage(n, "assistant", "Working.", { type: "assistant" });
const cxAgentMetadata = { type: "inter_agent_communication_metadata", payload: { trigger_turn: false } };
const cxAgentMessage = { type: "response_item", payload: { type: "agent_message", id: "amsg_1", author: "/root/verify_1", recipient: "/root", content: [{ type: "input_text", text: "Message Type: MESSAGE" }] } };

describe("turnStartLine, on Codex's transcript", () => {
  it("returns the line that started the turn as typed, after an earlier turn", () => {
    const text = toJsonl(cxStarted(1), cxUser(1, "[web card 1] earlier"), cxAssistant(1), cxComplete(1), cxStarted(2), cxContext(2), cxUser(2, "[web card 3] go"), cxAssistant(2));
    expect(turnStartLine(text)).toBe("[web card 3] go");
  });

  it("returns the line that started a turn flow held, after the hold's message", () => {
    const text = toJsonl(cxStarted(2), cxUser(2, "[web card 21] go"), cxAssistant(2), cxHold(2), cxAssistant(2));
    expect(turnStartLine(text)).toBe("[web card 21] go");
  });

  it("returns no line for a turn whose trigger is not a user's", () => {
    const text = toJsonl(cxStarted(1), cxUser(1, "[web card 3] go"), cxComplete(1), cxStarted(2, "agent"), cxAgentMetadata, cxAgentMessage, cxAssistant(2));
    expect(turnStartLine(text)).toBeNull();
  });

  it("returns only the typed item of a message whose content mixes a harness item and a user item", () => {
    const row = cxUser(1, "[web card 3] go") as { payload: { content: unknown[]; internal_chat_message_metadata_passthrough: Record<string, unknown> } };
    row.payload.content = [{ type: "input_text", text: "<environment_context/>" }, { type: "input_text", text: "[web card 3] go" }];
    row.payload.internal_chat_message_metadata_passthrough.content_item_metadata = [{ provenance: { type: "harness", hook: false } }, { provenance: { type: "user" } }];
    expect(turnStartLine(toJsonl(cxStarted(1), row))).toBe("[web card 3] go");
  });

  it("keeps the line that started the turn when another is typed while it runs", () => {
    const text = toJsonl(cxStarted(1), cxUser(1, "[work] Run .agents/skills/sweep/SKILL.md for 2026-11-26."), cxAssistant(1), cxUser(1, "[web card 4] go"), cxAssistant(1));
    expect(turnStartLine(text)).toBe("[work] Run .agents/skills/sweep/SKILL.md for 2026-11-26.");
  });

  it("returns no line when the turn that opened has no typed line yet", () => {
    expect(turnStartLine(toJsonl(cxStarted(1), cxUser(1, "[web card 3] go"), cxComplete(1), cxStarted(2), cxContext(2)))).toBeNull();
  });
});

// ── nothing to read ──

describe("turnStartLine, with nothing to read", () => {
  it.each([
    ["an empty text", ""],
    ["a text of blank lines", "\n  \n\n"],
    ["a Claude Code text with no typed line", toJsonl({ type: "last-prompt", sessionId: CC.sessionId }, ccAssistant, ccToolResult)],
    ["a Codex text with no typed line", toJsonl({ type: "session_meta", payload: { id: "x" } }, cxStarted(1), cxContext(1))],
    ["text that is not rows", "not a transcript\n[web card 3] go\n"],
    ["rows that are not objects", "1\n\"[web card 3] go\"\nnull\n[]\n"],
  ])("returns no line, and throws nothing, for %s", (_name, text) => {
    expect(turnStartLine(text)).toBeNull();
  });

  it("skips a torn last row of a Claude Code text, and returns no line when the torn row is the only start", () => {
    const whole = toJsonl(ccHuman("[web card 3] go"));
    expect(turnStartLine(whole + '{"type":"user","message":{"role":"us')).toBe("[web card 3] go");
    expect(turnStartLine('{"type":"user","isSidechain":false,"origin":{"kind":"hu')).toBeNull();
  });

  it("skips a torn last row of a Codex text, and returns no line when the torn row is the only start", () => {
    const whole = toJsonl(cxStarted(1), cxUser(1, "[web card 3] go"));
    expect(turnStartLine(whole + '{"type":"response_item","payload":{"type":"mess')).toBe("[web card 3] go");
    expect(turnStartLine(toJsonl(cxStarted(1)) + '{"type":"response_item","payload":{"type":"mess')).toBeNull();
  });
});
