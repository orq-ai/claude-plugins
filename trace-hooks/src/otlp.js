import { attr, compact, envOr, nowUnixNano } from "./common.js";
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

  const baseUrl = process.env.ORQ_BASE_URL;
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      const host = url.host.replace(/^my\./, "api.");
      return `${url.protocol}//${host}/v2/otel/v1/traces`;
    } catch {
      // fall through to default
    }
  }

  const fallback = envOr("ORQ_BASE_URL", "https://api.orq.ai").replace(/\/$/, "");
  if (fallback.includes("orq.ai") && fallback.includes("my.")) {
    return `${fallback.replace("//my.", "//api.")}/v2/otel/v1/traces`;
  }
  if (fallback.endsWith("/v2/otel")) {
    return `${fallback}/v1/traces`;
  }
  return `${fallback}/v2/otel/v1/traces`;
}

function getHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };

  if (process.env.ORQ_API_KEY) {
    headers.Authorization = `Bearer ${process.env.ORQ_API_KEY}`;
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
            spans: [span],
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
    try {
      const payload = await readQueuedPayload(filePath);
      await postPayload(payload);
      await deleteQueuedFile(filePath);
    } catch {
      break;
    }
  }
}

export async function sendSpan(span) {
  const payload = buildPayload(span);

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
