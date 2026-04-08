import { attr, compact, nowUnixNano } from "./common.js";
import { getApiKey, getBaseUrl } from "./config.js";
import {
  deleteQueuedFile,
  enqueuePayload,
  listQueuedFiles,
  readQueuedPayload,
} from "./state.js";

const SCOPE_NAME = "orq-claude-code";
const SDK_VERSION = "0.1.0";

function getEndpoint() {
  const explicit = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (explicit) {
    return explicit.endsWith("/v1/traces")
      ? explicit
      : `${explicit.replace(/\/$/, "")}/v1/traces`;
  }

  const baseUrl = getBaseUrl();
  try {
    const url = new URL(baseUrl);
    const host = url.host.replace(/^my\./, "api.");
    return `${url.protocol}//${host}/v2/otel/v1/traces`;
  } catch {
    return "https://api.orq.ai/v2/otel/v1/traces";
  }
}

function getHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };

  const apiKey = getApiKey();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
    for (const item of process.env.OTEL_EXPORTER_OTLP_HEADERS.split(",")) {
      const [rawKey, ...valueParts] = item.split("=");
      const key = rawKey?.trim();
      const value = valueParts.join("=").trim();
      if (key && value) {
        headers[key] = value;
      }
    }
  }

  return headers;
}

function buildPayload(span) {
  return buildBatchPayload([span]);
}

function buildBatchPayload(spans) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: compact([
            attr("service.name", "claude-code"),
            attr("telemetry.sdk.name", SCOPE_NAME),
            attr("telemetry.sdk.version", SDK_VERSION),
            attr("telemetry.sdk.language", "nodejs"),
          ]),
        },
        scopeSpans: [
          {
            scope: {
              name: SCOPE_NAME,
              version: SDK_VERSION,
            },
            spans,
          },
        ],
      },
    ],
  };
}

async function postPayload(payload) {
  const endpoint = getEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OTLP send failed (${response.status}): ${body}`);
  }
}

export async function drainQueue() {
  const queueFiles = await listQueuedFiles();
  for (const filePath of queueFiles) {
    let payload;
    try {
      payload = await readQueuedPayload(filePath);
    } catch {
      // Corrupt/unreadable file — drop it and continue draining.
      await deleteQueuedFile(filePath);
      continue;
    }
    try {
      await postPayload(payload);
      await deleteQueuedFile(filePath);
    } catch {
      // Network/endpoint failure — stop draining and retry next invocation.
      break;
    }
  }
}

export async function sendSpan(span) {
  return sendSpans([span]);
}

export async function sendSpans(spans) {
  if (spans.length === 0) {
    return;
  }

  const payload = buildBatchPayload(spans);

  try {
    await drainQueue();
    await postPayload(payload);
  } catch {
    try {
      await enqueuePayload(payload);
    } catch {
      // Best effort only.
    }
  }
}

export function createSpan({
  traceId,
  spanId,
  parentSpanId,
  name,
  kind = 1,
  startTimeUnixNano,
  endTimeUnixNano,
  attributes = [],
}) {
  return {
    traceId,
    spanId,
    parentSpanId,
    name,
    kind,
    startTimeUnixNano: startTimeUnixNano || nowUnixNano(),
    endTimeUnixNano: endTimeUnixNano || nowUnixNano(),
    attributes,
  };
}
