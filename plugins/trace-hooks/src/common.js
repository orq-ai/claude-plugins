import crypto from "node:crypto";

export function nowUnixNano() {
  return (BigInt(Date.now()) * 1000000n).toString();
}

export function isoToUnixNano(isoString) {
  const ms = new Date(isoString).getTime();
  if (Number.isNaN(ms)) {
    return nowUnixNano();
  }
  return (BigInt(ms) * 1000000n).toString();
}

export function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function toStringValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function attr(key, value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return { key, value: { stringValue: value } };
  }
  if (typeof value === "boolean") {
    return { key, value: { boolValue: value } };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { key, value: { intValue: String(value) } };
    }
    return { key, value: { doubleValue: value } };
  }
  return { key, value: { stringValue: JSON.stringify(value) } };
}

export function compact(list) {
  return list.filter(Boolean);
}

export function boolEnv(name, defaultValue = false) {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  return value === "1" || value.toLowerCase() === "true";
}

export function envOr(name, fallback) {
  return process.env[name] || fallback;
}
