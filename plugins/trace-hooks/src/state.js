import fs from "node:fs/promises";
import path from "node:path";

const STATE_ROOT =
  process.env.ORQ_CLAUDE_STATE_DIR ||
  path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "state");

const BASE_STATE_DIR = path.join(STATE_ROOT, "orq_sessions");
const BASE_QUEUE_DIR = path.join(STATE_ROOT, "orq_queue");

function sessionFile(sessionId) {
  return path.join(BASE_STATE_DIR, `${sessionId}.json`);
}

export async function ensureDirs() {
  await Promise.all([
    fs.mkdir(BASE_STATE_DIR, { recursive: true }),
    fs.mkdir(BASE_QUEUE_DIR, { recursive: true }),
  ]);
}

export async function loadSessionState(sessionId) {
  try {
    await ensureDirs();
    const content = await fs.readFile(sessionFile(sessionId), "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function saveSessionState(sessionId, state) {
  await ensureDirs();
  await fs.writeFile(sessionFile(sessionId), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function deleteSessionState(sessionId) {
  try {
    await ensureDirs();
    await fs.unlink(sessionFile(sessionId));
  } catch {
    // Ignore missing or inaccessible file
  }
}

export async function enqueuePayload(payload) {
  await ensureDirs();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  const filePath = path.join(BASE_QUEUE_DIR, fileName);
  await fs.writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

export async function listQueuedFiles() {
  try {
    await ensureDirs();
    const names = await fs.readdir(BASE_QUEUE_DIR);
    return names
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => path.join(BASE_QUEUE_DIR, name));
  } catch {
    return [];
  }
}

export async function readQueuedPayload(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

export async function deleteQueuedFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore delete failures
  }
}

const STALE_SESSION_MS = 24 * 60 * 60 * 1000; // 24 hours
const STALE_QUEUE_MS = 60 * 60 * 1000; // 1 hour

export async function pruneStaleFiles() {
  const now = Date.now();

  // Prune orphaned session files (mtime > 24h ago)
  try {
    const sessionNames = await fs.readdir(BASE_STATE_DIR);
    for (const name of sessionNames) {
      if (!name.endsWith(".json")) continue;
      const filePath = path.join(BASE_STATE_DIR, name);
      try {
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > STALE_SESSION_MS) {
          await fs.unlink(filePath);
        }
      } catch {
        // Ignore individual file errors
      }
    }
  } catch {
    // Ignore if directory doesn't exist
  }

  // Prune stale queue files (mtime > 1h ago)
  try {
    const queueNames = await fs.readdir(BASE_QUEUE_DIR);
    for (const name of queueNames) {
      if (!name.endsWith(".json")) continue;
      const filePath = path.join(BASE_QUEUE_DIR, name);
      try {
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > STALE_QUEUE_MS) {
          await fs.unlink(filePath);
        }
      } catch {
        // Ignore individual file errors
      }
    }
  } catch {
    // Ignore if directory doesn't exist
  }
}
