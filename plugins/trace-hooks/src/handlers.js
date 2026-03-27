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

async function closeCurrentTurn(state, endReason = "turn.closed") {
  if (!state.current_turn_span_id || !state.current_turn_started_at_ns) {
    return state;
  }

  const inputValue = sanitizeContent(state.current_turn_input || "");
  const inputMessages = asMessages("user", inputValue);

  const span = createSpan({
    traceId: state.trace_id,
    spanId: state.current_turn_span_id,
    parentSpanId: state.root_span_id,
    name: `claude.turn.${state.turn_count}`,
    kind: 1,
    startTimeUnixNano: state.current_turn_started_at_ns,
    endTimeUnixNano: nowUnixNano(),
    attributes: compact([
      attr("orq.span.kind", "agent"),
      attr("claude_code.turn.index", state.turn_count),
      attr("claude_code.turn.end_reason", endReason),
      attr("orq.input.value", toJson({ messages: inputMessages })),
      attr("gen_ai.input", toJson({ messages: inputMessages })),
      attr("input", toStringValue(inputValue)),
    ]),
  });

  await sendSpan(span);

  state.current_turn_span_id = null;
  state.current_turn_started_at_ns = null;
  state.current_turn_input = null;
  return state;
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

  await closeCurrentTurn(state, "turn.replaced_by_new_prompt");

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

async function emitTranscriptSpans(state, payload) {
  const transcriptPath = payload.transcript_path || payload.transcriptPath;
  const parsed = await parseTranscript(transcriptPath, state.last_processed_line || 0);

  // Merge tool calls and LLM messages into a single timeline sorted by timestamp
  const timeline = [];

  for (const tool of parsed.toolCalls) {
    timeline.push({ type: "tool", timestamp: tool.startTimestamp, data: tool });
  }

  for (const message of parsed.messages) {
    timeline.push({ type: "llm", timestamp: message.timestamp, data: message });
  }

  // Sort by timestamp so spans are emitted in chronological order
  timeline.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return -1;
    if (!b.timestamp) return 1;
    return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;
  });

  const spans = [];

  for (const entry of timeline) {
    if (entry.type === "tool") {
      const tool = entry.data;
      const inputValue = sanitizeContent(tool.input);
      const outputValue = sanitizeContent(tool.output);

      spans.push(createSpan({
        traceId: state.trace_id,
        spanId: randomHex(8),
        parentSpanId: state.current_turn_span_id,
        name: `tool.${tool.name}`,
        kind: 1,
        startTimeUnixNano: tool.startTimestamp ? isoToUnixNano(tool.startTimestamp) : undefined,
        endTimeUnixNano: tool.endTimestamp ? isoToUnixNano(tool.endTimestamp) : undefined,
        attributes: compact([
          attr("orq.span.kind", "tool"),
          attr("gen_ai.tool.name", tool.name),
          attr("tool.name", tool.name),
          attr("orq.input.value", toJson(inputValue)),
          attr("orq.output.value", toJson(outputValue)),
          attr("input", toStringValue(inputValue)),
          attr("output", toStringValue(outputValue)),
        ]),
      }));
    } else {
      const message = entry.data;
      const outputValue = sanitizeContent(message.output || payload.last_assistant_message || "");
      const outputMessages = asMessages("assistant", outputValue);

      const msgTime = message.timestamp ? isoToUnixNano(message.timestamp) : undefined;

      spans.push(createSpan({
        traceId: state.trace_id,
        spanId: randomHex(8),
        parentSpanId: state.current_turn_span_id,
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
          attr("gen_ai.output", toJson({ messages: outputMessages })),
          attr("gen_ai.response.finish_reasons", toJson([message.stopReason || payload.stop_reason || "stop"])),
          attr("orq.output.value", toJson({ choices: [{ index: 0, message: outputMessages[0] || { role: "assistant", content: "" }, finish_reason: message.stopReason || "stop" }] })),
          attr("output", toStringValue(outputValue)),
          ...usageAttrs(message.usage || {}),
        ]),
      }));
    }
  }

  if (spans.length > 0) {
    await sendSpans(spans);
  }

  // Update state with transcript progress
  state.total_tool_calls = (state.total_tool_calls || 0) + parsed.toolCalls.length;
  state.last_processed_line = parsed.nextLine;
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

  await emitTranscriptSpans(state, payload);
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

  // Emit any unprocessed transcript spans (covers -p mode where stop hook doesn't fire)
  if (state.current_turn_span_id) {
    await emitTranscriptSpans(state, payload);
  }

  await closeCurrentTurn(state, payload.reason || "session.end");

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

  await sendSpan(rootSpan);
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

  const span = createSpan({
    traceId: state.trace_id,
    spanId: subagent.span_id,
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
  });

  await sendSpan(span);

  delete state.subagents[agentId];
  await saveSessionState(sessionId, state);
}

export async function runSafely(handler) {
  try {
    if (!enabledTracing()) {
      return;
    }

    await handler();
  } catch {
    // Hooks must not block Claude Code flows.
  }
}
