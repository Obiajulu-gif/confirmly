#!/usr/bin/env node
/**
 * Imports credentials from the local (untracked, outside-repo) secrets file
 * into .env.local using canonical variable names.
 *
 * - Supports KEY=VALUE, KEY: VALUE, and "label line followed by value line".
 * - Never prints secret values — only variable names and present/missing.
 * - Generates cryptographically secure values for AUTH_SECRET,
 *   RECEIPT_TOKEN_SECRET and WHATSAPP_VERIFY_TOKEN when missing.
 * - Merges with an existing .env.local (existing keys are kept unless the
 *   source file provides a value for them).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const SOURCE_FILE =
  process.env.CONFIRMLY_SECRETS_FILE ??
  "C:\\Users\\googl\\Documents\\Confirmly API KEYs.txt";
const ENV_LOCAL = path.join(process.cwd(), ".env.local");

/** Label → canonical env var. Checked in order; first match wins. */
const LABEL_MAP = [
  [/whatsapp\s*business\s*account\s*id/i, "WHATSAPP_BUSINESS_ACCOUNT_ID"],
  [/phone\s*number\s*id/i, "WHATSAPP_PHONE_NUMBER_ID"],
  [/access\s*token/i, "WHATSAPP_ACCESS_TOKEN"],
  [/verify\s*token/i, "WHATSAPP_VERIFY_TOKEN"],
  [/graph\s*(api\s*)?version/i, "WHATSAPP_GRAPH_VERSION"],
  [/app\s*secret/i, "WHATSAPP_APP_SECRET"],
  [/app\s*id/i, "WHATSAPP_APP_ID"],
  [/(nvidia|nemotron|nim).*(api\s*key|key)/i, "NVIDIA_API_KEY"],
  [/monnify_contract_code|contract\s*code/i, "MONNIFY_CONTRACT_CODE"],
  [/secret\s*key/i, "MONNIFY_SECRET_KEY"],
  [/api\s*key/i, "MONNIFY_API_KEY"],
  [/base\s*url/i, "MONNIFY_BASE_URL"],
  [/database\s*url|postgres/i, "DATABASE_URL"],
  [/demo\s*merchant\s*email/i, "DEMO_MERCHANT_EMAIL"],
  [/demo\s*merchant\s*password/i, "DEMO_MERCHANT_PASSWORD"],
];

/** Labels that must be ignored (documented as NOT env config). */
const IGNORED_LABELS = [
  /wallet\s*account/i, // wallet account number is NOT the contract code
  /^whatsapp\s*number\s*$/i, // display number, not an API credential
  /providus/i,
  /mnfy/i,
  /confirmly\s*api\s*keys?/i, // document title, not a credential label
  /^monnify\s*api\s*key\s*$/i, // section heading with no value of its own
];

/** Fallback classification from the shape of the value itself. */
function classifyValue(value) {
  if (/^nvapi-[A-Za-z0-9_-]{20,}$/.test(value)) return "NVIDIA_API_KEY";
  if (/^MK_(TEST|PROD)_[A-Z0-9]+$/.test(value)) return "MONNIFY_API_KEY";
  if (/^EAA[A-Za-z0-9]{80,}$/.test(value)) return "WHATSAPP_ACCESS_TOKEN";
  if (/^https:\/\/(sandbox\.)?monnify\.com\/?$/.test(value))
    return "MONNIFY_BASE_URL";
  return null;
}

function parseSourceFile(text) {
  const found = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Inline KEY=VALUE or KEY: VALUE
    const inline = line.match(/^([A-Za-z_][A-Za-z0-9_ ]{1,60}?)\s*[=:]\s*(\S.*)$/);
    if (inline && inline[2]) {
      assign(found, inline[1].trim(), inline[2].trim());
      continue;
    }

    // Label on this line (possibly ending with ":"), value on the next
    // non-empty line that is not itself a known label.
    const label = line.replace(/:$/, "").trim();
    const next = nextNonEmpty(lines, i + 1);
    if (!next) continue;
    const nextIsLabel =
      LABEL_MAP.some(([re]) => re.test(next.value.replace(/:$/, ""))) &&
      !/^[A-Za-z0-9+/_.:-]{6,}$/.test(next.value);
    if (labelMatches(label) && !nextIsLabel) {
      assign(found, label, next.value.trim());
      i = next.index; // consume the value line
    }
  }

  // Second pass: value-shape detection. A value whose shape unambiguously
  // identifies a credential OVERRIDES a label-derived guess — labels in
  // free-form files are unreliable.
  for (const raw of lines) {
    const value = raw.trim();
    if (!value) continue;
    const key = classifyValue(value);
    if (key) found[key] = value;
  }
  return found;
}

function nextNonEmpty(lines, from) {
  for (let i = from; i < lines.length; i++) {
    const value = lines[i].trim();
    if (value) return { value, index: i };
  }
  return null;
}

function labelMatches(label) {
  if (IGNORED_LABELS.some((re) => re.test(label))) return false;
  return LABEL_MAP.some(([re]) => re.test(label));
}

function assign(found, label, value) {
  if (IGNORED_LABELS.some((re) => re.test(label))) return;
  // Exact canonical name always wins.
  if (/^[A-Z][A-Z0-9_]+$/.test(label)) {
    found[label] = value;
    return;
  }
  for (const [re, key] of LABEL_MAP) {
    if (re.test(label)) {
      if (!found[key]) found[key] = value;
      return;
    }
  }
}

function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function secureToken() {
  return randomBytes(32).toString("base64url");
}

// ---------------------------------------------------------------------------

if (!existsSync(SOURCE_FILE)) {
  console.error(`Secrets source file not found: ${SOURCE_FILE}`);
  console.error("Set CONFIRMLY_SECRETS_FILE to override the path.");
  process.exit(1);
}

const fromSource = parseSourceFile(readFileSync(SOURCE_FILE, "utf8"));
const existing = existsSync(ENV_LOCAL)
  ? parseEnvFile(readFileSync(ENV_LOCAL, "utf8"))
  : {};

const env = { ...existing };
for (const [key, value] of Object.entries(fromSource)) {
  env[key] = value;
}

// Defaults and generated secrets (only when missing/empty).
const generated = [];
const defaults = {
  APP_URL: "http://localhost:3000",
  WHATSAPP_GRAPH_VERSION: "v23.0",
  NVIDIA_BASE_URL: "https://integrate.api.nvidia.com/v1",
  NVIDIA_ORDER_MODEL: "nvidia/nemotron-3-nano-30b-a3b",
  MONNIFY_BASE_URL: "https://sandbox.monnify.com",
  DEMO_MERCHANT_EMAIL: "demo@confirmly.local",
  DEMO_MODE: "false",
};
for (const [key, value] of Object.entries(defaults)) {
  if (!env[key]) env[key] = value;
}
for (const key of [
  "AUTH_SECRET",
  "RECEIPT_TOKEN_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "DEMO_MERCHANT_PASSWORD",
]) {
  if (!env[key]) {
    env[key] = secureToken();
    generated.push(key);
  }
}

const CANONICAL_ORDER = [
  "APP_URL",
  "DATABASE_URL",
  "AUTH_SECRET",
  "RECEIPT_TOKEN_SECRET",
  "DEMO_MERCHANT_EMAIL",
  "DEMO_MERCHANT_PASSWORD",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_APP_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_GRAPH_VERSION",
  "NVIDIA_API_KEY",
  "NVIDIA_BASE_URL",
  "NVIDIA_ORDER_MODEL",
  "MONNIFY_BASE_URL",
  "MONNIFY_API_KEY",
  "MONNIFY_SECRET_KEY",
  "MONNIFY_CONTRACT_CODE",
  "SENTRY_DSN",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "DEMO_MODE",
];

const keys = [
  ...CANONICAL_ORDER.filter((k) => env[k] !== undefined),
  ...Object.keys(env).filter((k) => !CANONICAL_ORDER.includes(k)),
];
const body = keys.map((k) => `${k}=${env[k] ?? ""}`).join("\n") + "\n";
writeFileSync(ENV_LOCAL, body, "utf8");

// Report names only — never values.
const REQUIRED = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "RECEIPT_TOKEN_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "NVIDIA_API_KEY",
  "MONNIFY_API_KEY",
  "MONNIFY_SECRET_KEY",
  "MONNIFY_CONTRACT_CODE",
];
console.log("Wrote .env.local");
if (generated.length) console.log(`Generated secure values: ${generated.join(", ")}`);
const present = REQUIRED.filter((k) => env[k]);
const missing = REQUIRED.filter((k) => !env[k]);
console.log(`Present: ${present.join(", ") || "(none)"}`);
console.log(`Missing: ${missing.join(", ") || "(none)"}`);
process.exit(missing.length ? 2 : 0);
