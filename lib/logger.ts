/**
 * Structured logger with secret and PII redaction.
 *
 * - Known secret values (from env) are replaced before anything is written.
 * - Phone numbers are masked; fields named like addresses are dropped.
 * - Never log raw provider payloads — sanitize first.
 */

const SECRET_ENV_KEYS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "NVIDIA_API_KEY",
  "MONNIFY_API_KEY",
  "MONNIFY_SECRET_KEY",
  "AUTH_SECRET",
  "RECEIPT_TOKEN_SECRET",
  "DEMO_MERCHANT_PASSWORD",
  "DATABASE_URL",
];

const PII_FIELD_NAMES = /^(address|deliveryaddress|street|homeaddress)$/i;
const PHONE_RE = /\+?\d[\d\s().-]{8,18}\d/g;

function secretValues(): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of SECRET_ENV_KEYS) {
    const v = process.env[key];
    if (v && v.length >= 6) map.set(v, key);
  }
  return map;
}

export function redactText(text: string): string {
  let out = text;
  for (const [value, key] of secretValues()) {
    while (out.includes(value)) out = out.replace(value, `[REDACTED:${key}]`);
  }
  out = out.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 10) return m; // not a phone number
    return `${m.slice(0, 4)}…${digits.slice(-2)}`;
  });
  return out;
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (PII_FIELD_NAMES.test(k)) {
      out[k] = "[REDACTED:pii]";
    } else {
      out[k] = redactValue(v, depth + 1);
    }
  }
  return out;
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message: redactText(message),
    ...(meta ? { meta: redactValue(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    process.env.NODE_ENV !== "production" && write("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) =>
    write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    write("error", msg, meta),
};
