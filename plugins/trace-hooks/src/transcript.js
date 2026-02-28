import fs from "node:fs/promises";

function textFromContent(content) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      if (typeof block.text === "string") {
        return block.text;
      }
      if (block.type === "tool_use") {
        return JSON.stringify({ type: "tool_use", name: block.name, input: block.input });
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function parseTranscript(transcriptPath, lastProcessedLine = 0) {
  if (!transcriptPath) {
    return {
      messages: [],
      toolCalls: [],
      nextLine: lastProcessedLine,
    };
  }

  let content;
  try {
    content = await fs.readFile(transcriptPath, "utf8");
  } catch {
    return {
      messages: [],
      toolCalls: [],
      nextLine: lastProcessedLine,
    };
  }

  const lines = content.split("\n");
  const messages = [];
  const pendingTools = new Map(); // tool_use_id -> { name, input, startTimestamp }
  const toolCalls = [];

  for (let index = lastProcessedLine; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed?.type === "assistant" && parsed?.message) {
      const message = parsed.message;
      const messageContent = message.content;

      const output = textFromContent(messageContent);
      const usage = message.usage || {};

      // Deduplicate: if the previous message has the same output, merge by
      // keeping the one with more tokens (the final version)
      const prev = messages.length > 0 ? messages[messages.length - 1] : null;
      if (prev && prev.output === output && output) {
        const prevTokens = prev.usage.output_tokens || 0;
        const curTokens = usage.output_tokens || 0;
        if (curTokens >= prevTokens) {
          prev.usage = usage;
          prev.stopReason = message.stop_reason;
          prev.model = message.model || prev.model;
          prev.timestamp = parsed.timestamp;
        }
      } else {
        messages.push({
          model: message.model || "unknown",
          usage,
          output,
          stopReason: message.stop_reason,
          timestamp: parsed.timestamp,
        });
      }

      // Extract tool_use blocks with their start timestamps
      if (Array.isArray(messageContent)) {
        for (const block of messageContent) {
          if (block?.type === "tool_use" && block.id) {
            pendingTools.set(block.id, {
              name: block.name || "tool",
              input: block.input,
              startTimestamp: parsed.timestamp,
            });
          }
        }
      }
    }

    // Match tool_result to its tool_use
    if (parsed?.type === "user" && parsed?.message) {
      const userContent = parsed.message.content;
      if (Array.isArray(userContent)) {
        for (const block of userContent) {
          if (block?.type === "tool_result" && block.tool_use_id) {
            const pending = pendingTools.get(block.tool_use_id);
            if (pending) {
              toolCalls.push({
                name: pending.name,
                input: pending.input,
                output: block.content,
                startTimestamp: pending.startTimestamp,
                endTimestamp: parsed.timestamp,
              });
              pendingTools.delete(block.tool_use_id);
            }
          }
        }
      }
    }
  }

  return {
    messages,
    toolCalls,
    nextLine: lines.length,
  };
}

// Keep backward-compatible alias
export async function parseAssistantMessages(transcriptPath, lastProcessedLine = 0) {
  return parseTranscript(transcriptPath, lastProcessedLine);
}
