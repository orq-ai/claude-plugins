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

export async function parseAssistantMessages(transcriptPath, lastProcessedLine = 0) {
  if (!transcriptPath) {
    return {
      messages: [],
      nextLine: lastProcessedLine,
    };
  }

  let content;
  try {
    content = await fs.readFile(transcriptPath, "utf8");
  } catch {
    return {
      messages: [],
      nextLine: lastProcessedLine,
    };
  }

  const lines = content.split("\n");
  const messages = [];

  for (let index = lastProcessedLine; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    try {
      const parsed = JSON.parse(line);
      if (parsed?.type === "assistant" && parsed?.message) {
        const message = parsed.message;
        messages.push({
          model: message.model || "unknown",
          usage: message.usage || {},
          output: textFromContent(message.content),
          stopReason: message.stop_reason,
        });
      }
    } catch {
      // Ignore malformed transcript lines
    }
  }

  return {
    messages,
    nextLine: lines.length,
  };
}
