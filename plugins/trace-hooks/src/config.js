import fs from "node:fs";
import path from "node:path";

const ORQ_CONFIG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".config",
  "orq",
  "config.json",
);

let _cached = null;

function loadOrqConfig() {
  if (_cached !== null) return _cached;
  try {
    const raw = fs.readFileSync(ORQ_CONFIG_PATH, "utf8");
    _cached = JSON.parse(raw);
  } catch {
    _cached = {};
  }
  return _cached;
}

function resolveProfile() {
  const config = loadOrqConfig();
  const profiles = config.profiles || {};

  // ORQ_PROFILE env var takes priority, then the CLI's current profile
  const profileName = process.env.ORQ_PROFILE || config.current;
  if (profileName && profiles[profileName]) {
    return profiles[profileName];
  }

  return null;
}

/**
 * Resolve the API key with the following priority:
 * 1. ORQ_API_KEY env var
 * 2. Profile from ORQ_PROFILE env var
 * 3. Current profile in ~/.config/orq/config.json
 */
export function getApiKey() {
  if (process.env.ORQ_API_KEY) {
    return process.env.ORQ_API_KEY;
  }
  return resolveProfile()?.api_key || null;
}

/**
 * Resolve the base URL with the following priority:
 * 1. ORQ_BASE_URL env var
 * 2. Profile from ORQ_PROFILE env var
 * 3. Current profile in ~/.config/orq/config.json
 * 4. Default: https://my.orq.ai
 */
export function getBaseUrl() {
  if (process.env.ORQ_BASE_URL) {
    return process.env.ORQ_BASE_URL;
  }
  return resolveProfile()?.base_url || "https://my.orq.ai";
}
