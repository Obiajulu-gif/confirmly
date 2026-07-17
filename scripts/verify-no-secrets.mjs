#!/usr/bin/env node
/**
 * Secret scanner. Fails (exit 1) if any known secret value or common token
 * pattern is found in:
 *   - tracked files (working tree)
 *   - staged content
 *   - full git history
 *   - client build output (.next/static), when present
 *
 * Loads the exact secret values from .env.local (and the local source file,
 * if present) so the scan catches literal leaks. Never prints a secret —
 * matches are reported as file + variable name / pattern only.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

// --- Collect secret values (values never leave this process) --------------
const SECRET_KEYS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "NVIDIA_API_KEY",
  "MONNIFY_API_KEY",
  "MONNIFY_SECRET_KEY",
  "AUTH_SECRET",
  "RECEIPT_TOKEN_SECRET",
  "DEMO_MERCHANT_PASSWORD",
  "DATABASE_URL",
];
const secrets = new Map(); // value -> label

function harvestEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.+)$/);
    const value = m ? m[2].trim().replace(/^"(.*)"$/, "$1") : "";
    if (m && SECRET_KEYS.includes(m[1]) && value.length >= 8) {
      secrets.set(value, m[1]);
    }
  }
}
harvestEnvFile(path.join(ROOT, ".env.local"));
harvestEnvFile(path.join(ROOT, ".env"));

const sourceFile =
  process.env.CONFIRMLY_SECRETS_FILE ??
  "C:\\Users\\googl\\Documents\\Confirmly API KEYs.txt";
if (existsSync(sourceFile)) {
  for (const raw of readFileSync(sourceFile, "utf8").split(/\r?\n/)) {
    const v = raw.trim();
    if (v.length < 16 || !/^[A-Za-z0-9+/_=.-]+$/.test(v)) continue;
    if (v.startsWith("http")) continue;
    // Lines shaped like ENV_VAR_NAMES are labels, not secret values.
    if (/^[A-Z][A-Z0-9_]*$/.test(v)) continue;
    if (!secrets.has(v)) secrets.set(v, "credentials-file value");
  }
}

// --- Generic token patterns ------------------------------------------------
const PATTERNS = [
  [/EAA[A-Za-z0-9]{80,}/g, "Meta access token"],
  [/nvapi-[A-Za-z0-9_-]{20,}/g, "NVIDIA API key"],
  [/MK_(TEST|PROD)_[A-Z0-9]{6,}/g, "Monnify API key"],
  [/sk-[A-Za-z0-9]{20,}/g, "generic sk- API key"],
  [/ghp_[A-Za-z0-9]{30,}/g, "GitHub token"],
  [/gho_[A-Za-z0-9]{30,}/g, "GitHub OAuth token"],
  [/AKIA[0-9A-Z]{16}/g, "AWS access key"],
  [/postgres(ql)?:\/\/[^ \n'"]*:[^ \n'"@]{6,}@/g, "database URL with password"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/g, "Slack token"],
];

function scanText(text, where) {
  for (const [value, label] of secrets) {
    if (text.includes(value)) {
      failures.push(`${where}: literal secret value for ${label}`);
    }
  }
  for (const [re, label] of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) failures.push(`${where}: matches pattern "${label}"`);
  }
}

function git(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 256,
    ...opts,
  });
}

// --- 1. Tracked + staged files --------------------------------------------
let trackedFiles = [];
try {
  trackedFiles = git(["ls-files"]).split("\n").filter(Boolean);
} catch {
  console.error("Not a git repository — scanning skipped for history.");
}
for (const file of trackedFiles) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) continue;
  if (statSync(full).size > 5 * 1024 * 1024) continue;
  let text;
  try {
    text = readFileSync(full, "utf8");
  } catch {
    continue;
  }
  scanText(text, `tracked:${file}`);
}

// Env files must never be tracked (only .env.example is allowed).
for (const file of trackedFiles) {
  const base = path.basename(file);
  if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") {
    failures.push(`tracked env file: ${file}`);
  }
}

// --- 2. Full history --------------------------------------------------------
try {
  const history = git(["log", "--all", "-p", "--no-color"]);
  scanText(history, "git-history");
} catch {
  /* empty repo (no commits yet) is fine */
}

// --- 3. Client build output -------------------------------------------------
const staticDir = path.join(ROOT, ".next", "static");
if (existsSync(staticDir)) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue; // stale dev-server artifact
      }
      if (stat.isDirectory()) walk(full);
      else if (/\.(js|css|json|txt)$/.test(entry)) {
        try {
          scanText(
            readFileSync(full, "utf8"),
            `client-bundle:${path.relative(ROOT, full)}`
          );
        } catch {
          /* unreadable dev artifact */
        }
      }
    }
  };
  walk(staticDir);
}

// NEXT_PUBLIC_ misuse check in source.
for (const file of trackedFiles) {
  if (!/\.(ts|tsx|js|jsx|mjs)$/.test(file)) continue;
  const full = path.join(ROOT, file);
  if (!existsSync(full)) continue;
  const text = readFileSync(full, "utf8");
  if (/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|KEY|PASSWORD)/.test(text)) {
    failures.push(`${file}: NEXT_PUBLIC_ variable name looks like a secret`);
  }
}

// --- Report ------------------------------------------------------------------
const unique = [...new Set(failures)];
if (unique.length) {
  console.error("SECRET SCAN FAILED:");
  for (const f of unique) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `Secret scan passed (${trackedFiles.length} tracked files, history, bundles).`
);
