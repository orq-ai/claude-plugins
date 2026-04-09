import { execFileSync } from "node:child_process";

import { getApiKey } from "./config.js";
import {
  attr,
  compact,
  isoToUnixNano,
  nowUnixNano,
  randomHex,
  readStdinJson,
  toStringValue,
} from "./common.js";
import { sendSpan, sendSpans, createSpan } from "./otlp.js";
import { sanitizeContent } from "./redact.js";
import {
  deleteSessionState,
  loadSessionState,
  pruneStaleFiles,
  saveSessionState,
} from "./state.js";
import { parseTranscript } from "./transcript.js";

function noThrow(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function getGitBranch(cwd) {
  return noThrow(() =>
    execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
    }).trim(),
  );
}

function getGitRepo(cwd) {
  return noThrow(() =>
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
    }).trim(),
  );
}

function getSessionId(payload) {
  return (
    payload.session_id ||
    payload.sessionId ||
    process.env.CLAUDE_SESSION_ID ||
    process.env.SESSION_ID ||
    null
  );
}

function getPrompt(payload) {
  return payload.prompt || payload.user_prompt || payload.input || "";
}

function enabledTracing() {
  return Boolean(getApiKey());
}

function asMessages(role, content) {
  if (!content) {
    return [];
  }
  return [{ role, content: String(content) }];
}

function toJson(value) {
  return JSON.stringify(value);
}

function usageAttrs(usage) {
  const prompt = usage.input_tokens ?? usage.prompt_tokens;
  const completion = usage.output_tokens ?? usage.completion_tokens;
  const total = usage.total_tokens ?? ((prompt || 0) + (completion || 0));

  return compact([
    attr("gen_ai.usage.input_tokens", prompt),
    attr("gen_ai.usage.output_tokens", completion),
    attr("gen_ai.usage.prompt_tokens", prompt),
    attr("gen_ai.usage.completion_tokens", completion),
    attr("gen_ai.usage.total_tokens", total),
    attr("prompt_tokens", prompt),
    attr("completion_tokens", completion),
    attr("input_tokens", prompt),
    attr("output_tokens", completion),
    attr("total_tokens", total),
  ]);
}

function buildTurnSpan(state, endReason = "turn.closed") {
  if (!state.current_turn_span_id || !state.current_turn_started_at_ns) {
    return null;
  }

  const inputValue = sanitizeContent(state.current_turn_input || "");
  const inputMessages = asMessages("user", inputValue);

  return createSpan({
    traceId: state.trace_id,
    spanId: state.current_turn_span_id,
    parentSpanId: state.root_span_id,
    name: `claude.turn.${state.turn_count}`,
    kind: 1,
    startTimeUnixNano: state.current_turn_started_at_ns,
    endTimeUnixNano: nowUnixNano(),
    attributes: compact([
      attr("orq.span.kind", "agent"),
      attr("gen_ai.operation.name", `claude.turn.${state.turn_count}`),
      attr("claude_code.turn.index", state.turn_count),
      attr("claude_code.turn.end_reason", endReason),
      attr("gen_ai.system", "anthropic"),
      attr("gen_ai.provider.name", "anthropic"),
      attr("gen_ai.agent.name", `claude.turn.${state.turn_count}`),
      attr("gen_ai.agent.framework", "claude-code"),
      // NOTE: Do NOT set both gen_ai.input and orq.input.value on agent spans.
      // The backend's dot-notation $set for agent spans conflicts when both are
      // present, causing a silent DuplicateKeyError that drops the span entirely.
      attr("gen_ai.input", toJson({ messages: inputMessages })),
      attr("input", toStringValue(inputValue)),
    ]),
  });
}

export async function handleSessionStart() {
  const payload = await readStdinJson();
  const sessionId = getSessionId(payload);
  if (!sessionId) {
    return;
  }

  // Prune stale session/queue files on startup (best-effort, non-blocking)
  pruneStaleFiles().catch(() => {});

  const existing = await loadSessionState(sessionId);
  if (existing) {
    return;
  }

  const cwd = payload.cwd || process.cwd();
  const state = {
    session_id: sessionId,
    trace_id: randomHex(16),
    root_span_id: randomHex(8),
    session_started_at_ns: nowUnixNano(),
    turn_count: 0,
    total_tool_calls: 0,
    current_turn_span_id: null,
    current_turn_started_at_ns: null,
    current_turn_input: null,
    model: payload.model || payload.model_name || null,
    source: payload.source || null,
    cwd,
    git_branch: getGitBranch(cwd),
    git_repo: getGitRepo(cwd),
    last_processed_line: 0,
    subagents: {},
  };

  await saveSessionState(sessionId, state);
}

export async function handleUserPromptSubmit() {
  const payload = await readStdinJson();
  const sessionId = getSessionId(payload);
  if (!sessionId) {
    return;
  }

  const state = await loadSessionState(sessionId);
  if (!state) {
    return;
  }

  // Send the previous turn span before starting a new one (interactive mode)
  const prevTurnSpan = buildTurnSpan(state, "turn.replaced_by_new_prompt");
  if (prevTurnSpan) {
    await sendSpan(prevTurnSpan);
  }

  state.current_turn_span_id = null;
  state.current_turn_started_at_ns = null;
  state.current_turn_input = null;
  state.turn_count += 1;
  state.current_turn_span_id = randomHex(8);
  state.current_turn_started_at_ns = nowUnixNano();
  state.current_turn_input = getPrompt(payload);

  await saveSessionState(sessionId, state);
}

export async function handlePostToolUseFailure() {
  const payload = await readStdinJson();
  const sessionId = getSessionId(payload);
  if (!sessionId) {
    return;
  }

  const state = await loadSessionState(sessionId);
  if (!state || !state.current_turn_span_id) {
    return;
  }

  state.failed_tool_calls ||= [];
  state.failed_tool_calls.push({
    tool_name: payload.tool_name || payload.toolName || "unknown",
    error: payload.error || payload.stderr || "",
    timestamp: nowUnixNano(),
  });

  await saveSessionState(sessionId, state);
}

export async function handlePreCompact() {
  const payload = await readStdinJson();
  const sessionId = getSessionId(payload);
  if (!sessionId) {
    return;
  }

  const state = await loadSessionState(sessionId);
  if (!state) {
    return;
  }

  const span = createSpan({
    traceId: state.trace_id,
    spanId: randomHex(8),
    parentSpanId: state.current_turn_span_id || state.root_span_id,
    name: "claude.context.compact",
    kind: 1,
    attributes: compact([
      attr("orq.span.kind", "event"),
      attr("claude_code.event", "context_compaction"),
      attr("claude_code.turn_count_at_compaction", state.turn_count),
    ]),
  });

  await sendSpan(span);
}

async function emitTranscriptSpans(state, payload, { emitPending = false } = {}) {
  const transcriptPath = payload.transcript_path || payload.transcriptPath;
  const parsed = await parseTranscript(transcriptPath, state.last_processed_line || 0, { emitPending });

  // Merge tool calls and LLM messages into a single timeline sorted by timestamp
  const timeline = [];

  for (const tool of parsed.toolCalls) {
    timeline.push({ type: "tool", timestamp: tool.startTimestamp, data: tool });
  }

  for (const message of parsed.messages) {
    timeline.push({ type: "llm", timestamp: message.timestamp, data: message });
  }

  // Sort by timestamp so spans are emitted in chronological order. When
  // timestamps tie, LLM messages must come BEFORE tool calls — the assistant
  // message that requests a tool is logged at the same instant as the tool's
  // startTimestamp, but logically the LLM produced the request first.
  timeline.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return -1;
    if (!b.timestamp) return 1;
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
    if (a.type === b.type) return 0;
    return a.type === "llm" ? -1 : 1;
  });

  const spans = [];
  // Track end time of previous entry so LLM spans (which only have one
  // timestamp in the transcript) can use it as a start time instead of
  // producing zero-duration spans.
  let previousEndNs = state.current_turn_started_at_ns || null;
  // Reconstruct the conversation thread so each LLM span carries the
  // messages that led to its response (user prompt, tool results, prior
  // assistant turns). Without this, LLM spans show empty input in the UI.
  const conversation = [];
  const initialUserInput = sanitizeContent(state.current_turn_input || "");
  if (initialUserInput) {
    conversation.push({ role: "user", content: String(initialUserInput) });
  }

  for (const entry of timeline) {
    if (entry.type === "tool") {
      const tool = entry.data;
      const inputValue = sanitizeContent(tool.input);
      const outputValue = sanitizeContent(tool.output);

      // Agent tool calls are emitted as tool spans here too. If
      // SubagentStart/Stop hooks fire they add richer sibling subagent.*
      // spans; some overlap is better than losing Agent calls entirely
      // when those hooks don't fire (e.g. in -p / non-interactive mode).

      const toolStartNs = tool.startTimestamp ? isoToUnixNano(tool.startTimestamp) : undefined;
      const toolEndNs = tool.endTimestamp ? isoToUnixNano(tool.endTimestamp) : undefined;
      spans.push(createSpan({
        traceId: state.trace_id,
        spanId: randomHex(8),
        parentSpanId: state.current_turn_span_id,
        name: `tool.${tool.name}`,
        kind: 1,
        startTimeUnixNano: toolStartNs,
        endTimeUnixNano: toolEndNs,
        attributes: compact([
          attr("orq.span.kind", "tool"),
          attr("gen_ai.tool.name", tool.name),
          attr("tool.name", tool.name),
          attr("orq.input.value", inputValue),
          attr("orq.output.value", outputValue),
          attr("input", toStringValue(inputValue)),
          attr("output", toStringValue(outputValue)),
          tool.incomplete ? attr("claude_code.tool.incomplete", true) : null,
        ]),
      }));
      previousEndNs = toolEndNs || toolStartNs || previousEndNs;
      // Append tool result as a user-role message in the conversation thread
      // so the next LLM span's input shows what the model received.
      conversation.push({
        role: "tool",
        name: tool.name,
        content: toStringValue(outputValue),
      });
    } else {
      const message = entry.data;
      const outputValue = sanitizeContent(message.output || payload.last_assistant_message || "");
      const parts = (message.parts || []).map(p => ({ ...p, content: sanitizeContent(p.content) }));

      // Include both content (for list views / backwards compat) and parts (for rich display with reasoning)
      const outputMsg = {
        role: "assistant",
        content: String(outputValue),
        ...(parts.length > 0 ? { parts } : {}),
        finish_reason: message.stopReason || "stop",
      };
      const outputMessages = [outputMsg];

      const msgEndNs = message.timestamp ? isoToUnixNano(message.timestamp) : undefined;
      // Use previous entry's end as start so LLM spans reflect real latency,
      // but never let start exceed end (would produce a negative duration).
      let msgStartNs = previousEndNs || msgEndNs;
      if (msgStartNs && msgEndNs && BigInt(msgStartNs) > BigInt(msgEndNs)) {
        msgStartNs = msgEndNs;
      }

      // Snapshot the conversation thread leading up to this response
      // (everything received so far, before this assistant message).
      const inputMessages = conversation.map((m) => ({ ...m }));

      spans.push(createSpan({
        traceId: state.trace_id,
        spanId: randomHex(8),
        parentSpanId: state.current_turn_span_id,
        name: `${message.model || state.model || "claude"}.response`,
        kind: 3,
        startTimeUnixNano: msgStartNs,
        endTimeUnixNano: msgEndNs,
        attributes: compact([
          attr("orq.span.kind", "llm"),
          attr("gen_ai.operation.name", "chat.completions"),
          attr("gen_ai.system", "anthropic"),
          attr("gen_ai.provider.name", "anthropic"),
          attr("gen_ai.request.model", message.model || state.model || "unknown"),
          attr("gen_ai.response.model", message.model || state.model || "unknown"),
          attr("gen_ai.input", toJson({ messages: inputMessages })),
          attr("orq.input.value", toJson({ messages: inputMessages })),
          attr("input", toJson({ messages: inputMessages })),
          attr("gen_ai.output", toJson({ messages: outputMessages, choices: [{ index: 0, message: outputMsg }] })),
          attr("gen_ai.response.finish_reasons", [message.stopReason || payload.stop_reason || "stop"]),
          attr("orq.output.value", toJson({ choices: [{ index: 0, message: outputMsg, finish_reason: message.stopReason || "stop" }] })),
          attr("output", toJson({ choices: [{ index: 0, message: outputMsg, finish_reason: message.stopReason || "stop" }] })),
          ...usageAttrs(message.usage || {}),
        ]),
      }));
      conversation.push({ role: "assistant", content: String(outputValue) });
      previousEndNs = msgEndNs || previousEndNs;
    }
  }

  // Update state with transcript progress
  state.total_tool_calls = (state.total_tool_calls || 0) + parsed.toolCalls.length;
  state.last_processed_line = parsed.nextLine;

  return spans;
}

export async function handleStop() {
  const payload = await readStdinJson();
  const sessionId = getSessionId(payload);
  if (!sessionId) {
    return;
  }

  const state = await loadSessionState(sessionId);
  if (!state || !state.current_turn_span_id) {
    return;
  }

  const spans = await emitTranscriptSpans(state, payload);
  if (spans.length > 0) {
    await sendSpans(spans);
  }
  // Don't close the turn here — SessionEnd handles it in a single batch.
  await saveSessionState(sessionId, state);
}

export async function handleSessionEnd() {
  const payload = await readStdinJson();
  const sessionId = getSessionId(payload);
  if (!sessionId) {
    return;
  }

  const state = await loadSessionState(sessionId);
  if (!state) {
    return;
  }

  // If no turn was opened (e.g. -p mode where UserPromptSubmit may not fire),
  // create a synthetic turn so transcript sub-spans have a parent.
  if (!state.current_turn_span_id) {
    if (state.turn_count === 0) state.turn_count = 1;
    state.current_turn_span_id = randomHex(8);
    state.current_turn_started_at_ns = state.session_started_at_ns;
    state.current_turn_input = payload.prompt || state.current_turn_input || "";
  }

  // Batch all remaining spans into a single sendSpans call so the entire
  // trace lands in one HTTP request. Async hooks in -p mode get killed
  // quickly — multiple sequential sends lose later spans.
  const rootSpan = createSpan({
    traceId: state.trace_id,
    spanId: state.root_span_id,
    name: "orq.claude_code.session",
    kind: 1,
    startTimeUnixNano: state.session_started_at_ns,
    endTimeUnixNano: nowUnixNano(),
    attributes: compact([
      attr("orq.span.kind", "workflow"),
      attr("orq.trace.framework.name", "claude-code"),
      attr("claude_code.session_id", state.session_id),
      attr("claude_code.permission_mode", payload.permission_mode || process.env.CLAUDE_PERMISSION_MODE || ""),
      attr("claude_code.cwd", state.cwd || payload.cwd || ""),
      attr("claude_code.model", state.model || payload.model || ""),
      attr("claude_code.git.branch", state.git_branch || ""),
      attr("claude_code.git.repo", state.git_repo || ""),
      attr("claude_code.total_turns", state.turn_count || 0),
      attr("claude_code.total_tool_calls", state.total_tool_calls || 0),
      attr("claude_code.failed_tool_calls", (state.failed_tool_calls || []).length),
      attr("claude_code.end_reason", payload.reason || ""),
    ]),
  });

  // Collect transcript spans (any unprocessed by Stop)
  let transcriptSpans = [];
  if (state.current_turn_span_id) {
    transcriptSpans = await emitTranscriptSpans(state, payload, { emitPending: true });
  }

  // Send order matters: the orq backend processes spans in parallel and
  // child spans do $inc upserts on parent_id. If a child's $inc creates a
  // stub before the parent span's $set arrives, the parent's transaction
  // loses the race with a DuplicateKeyError and is silently dropped.
  // Sending parent spans FIRST ensures their document exists before any
  // child $inc can race.
  const turnSpan = buildTurnSpan(state, payload.reason || "session.end");

  if (process.env.ORQ_DEBUG === "1" || process.env.ORQ_DEBUG === "true") {
    const allSpans = [rootSpan, turnSpan, ...transcriptSpans].filter(Boolean);
    const msg = `[orq-trace] SessionEnd: ${allSpans.length} spans (1 root + ${turnSpan ? 1 : 0} turn + ${transcriptSpans.length} transcript), turn_span_id=${state.current_turn_span_id}\n`;
    process.stderr.write(msg);
    try { const fs = await import("node:fs"); fs.default.appendFileSync("/tmp/orq-trace-debug.log", msg); } catch {}
  }

  // 1. Root span first (parent of turn)
  await sendSpan(rootSpan);
  // 2. Turn span (parent of transcript children)
  if (turnSpan) {
    await sendSpan(turnSpan);
  }
  // 3. Transcript children last (their $inc on parent is safe now)
  if (transcriptSpans.length > 0) {
    await sendSpans(transcriptSpans);
  }

  await deleteSessionState(sessionId);
}

export async function handleSubagentStart() {
  const payload = await readStdinJson();
  const sessionId = getSessionId(payload);
  if (!sessionId) {
    return;
  }

  const state = await loadSessionState(sessionId);
  if (!state || !state.current_turn_span_id) {
    return;
  }

  const agentId = payload.agent_id || payload.agentId;
  if (!agentId) {
    return;
  }

  state.subagents ||= {};
  state.subagents[agentId] = {
    span_id: randomHex(8),
    started_at_ns: nowUnixNano(),
    parent_span_id: state.current_turn_span_id,
    type: payload.agent_type || payload.agentType || "subagent",
  };

  await saveSessionState(sessionId, state);
}

export async function handleSubagentStop() {
  const payload = await readStdinJson();
  const sessionId = getSessionId(payload);
  if (!sessionId) {
    return;
  }

  const state = await loadSessionState(sessionId);
  if (!state) {
    return;
  }

  const agentId = payload.agent_id || payload.agentId;
  if (!agentId || !state.subagents?.[agentId]) {
    return;
  }

  const subagent = state.subagents[agentId];
  const outputValue = sanitizeContent(payload.last_assistant_message || "");

  const subagentSpanId = subagent.span_id;
  const spans = [];

  // Emit the subagent wrapper span
  spans.push(createSpan({
    traceId: state.trace_id,
    spanId: subagentSpanId,
    parentSpanId: subagent.parent_span_id,
    name: `subagent.${subagent.type}`,
    kind: 1,
    startTimeUnixNano: subagent.started_at_ns,
    endTimeUnixNano: nowUnixNano(),
    attributes: compact([
      attr("orq.span.kind", "agent"),
      attr("claude_code.subagent.id", agentId),
      attr("claude_code.subagent.type", subagent.type),
      attr("orq.output.value", toJson({ messages: asMessages("assistant", outputValue) })),
      attr("output", toStringValue(outputValue)),
    ]),
  }));

  // Parse the subagent's own transcript for child spans
  const agentTranscriptPath = payload.agent_transcript_path || payload.agentTranscriptPath;
  if (agentTranscriptPath) {
    const parsed = await parseTranscript(agentTranscriptPath, 0);

    for (const tool of parsed.toolCalls) {
      const toolInput = sanitizeContent(tool.input);
      const toolOutput = sanitizeContent(tool.output);
      spans.push(createSpan({
        traceId: state.trace_id,
        spanId: randomHex(8),
        parentSpanId: subagentSpanId,
        name: `tool.${tool.name}`,
        kind: 1,
        startTimeUnixNano: tool.startTimestamp ? isoToUnixNano(tool.startTimestamp) : undefined,
        endTimeUnixNano: tool.endTimestamp ? isoToUnixNano(tool.endTimestamp) : undefined,
        attributes: compact([
          attr("orq.span.kind", "tool"),
          attr("gen_ai.tool.name", tool.name),
          attr("tool.name", tool.name),
          attr("orq.input.value", toolInput),
          attr("orq.output.value", toolOutput),
          attr("input", toStringValue(toolInput)),
          attr("output", toStringValue(toolOutput)),
        ]),
      }));
    }

    for (const message of parsed.messages) {
      const msgOutput = sanitizeContent(message.output || "");
      const msgParts = (message.parts || []).map(p => ({ ...p, content: sanitizeContent(p.content) }));
      const msgOutputMsg = {
        role: "assistant",
        content: String(msgOutput),
        ...(msgParts.length > 0 ? { parts: msgParts } : {}),
        finish_reason: message.stopReason || "stop",
      };
      const msgOutputMessages = [msgOutputMsg];
      const msgTime = message.timestamp ? isoToUnixNano(message.timestamp) : undefined;
      spans.push(createSpan({
        traceId: state.trace_id,
        spanId: randomHex(8),
        parentSpanId: subagentSpanId,
        name: `${message.model || state.model || "claude"}.response`,
        kind: 3,
        startTimeUnixNano: msgTime,
        endTimeUnixNano: msgTime,
        attributes: compact([
          attr("orq.span.kind", "llm"),
          attr("gen_ai.operation.name", "chat.completions"),
          attr("gen_ai.system", "anthropic"),
          attr("gen_ai.provider.name", "anthropic"),
          attr("gen_ai.request.model", message.model || state.model || "unknown"),
          attr("gen_ai.response.model", message.model || state.model || "unknown"),
          attr("gen_ai.output", toJson({ messages: msgOutputMessages, choices: [{ index: 0, message: msgOutputMsg }] })),
          attr("gen_ai.response.finish_reasons", [message.stopReason || "stop"]),
          attr("orq.output.value", toJson({ choices: [{ index: 0, message: msgOutputMsg, finish_reason: message.stopReason || "stop" }] })),
          attr("output", toJson({ choices: [{ index: 0, message: msgOutputMsg, finish_reason: message.stopReason || "stop" }] })),
          ...usageAttrs(message.usage || {}),
        ]),
      }));
    }
  }

  await sendSpans(spans);

  delete state.subagents[agentId];
  await saveSessionState(sessionId, state);
}

export async function runSafely(handler) {
  try {
    if (!enabledTracing()) {
      return;
    }

    await handler();
  } catch (err) {
    // Hooks must not block Claude Code flows.
    if (process.env.ORQ_DEBUG === "1" || process.env.ORQ_DEBUG === "true") {
      process.stderr.write(`[orq-trace] ${err?.stack || err}\n`);
    }
  }
}
