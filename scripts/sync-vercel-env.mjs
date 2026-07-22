#!/usr/bin/env node
/**
 * Pushes production environment variables from .env.local to Vercel without
 * ever echoing a value. Requires an authenticated Vercel CLI and a linked
 * project (`vercel link`).
 *
 *   node scripts/sync-vercel-env.mjs [--dry-run] [--target production]
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const targetIndex = process.argv.indexOf("--target");
const TARGET =
  targetIndex !== -1 ? (process.argv[targetIndex + 1] ?? "production") : "production";

// APP_URL is deliberately NOT synced: the local value points at localhost
// and would break production links. Set it once in Vercel to the deployed
// domain.
const PUSH_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "ENCRYPTION_KEY",
  "RECEIPT_TOKEN_SECRET",
  "DEMO_MERCHANT_EMAIL",
  "DEMO_MERCHANT_PASSWORD",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_PUBLIC_NUMBER",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_GRAPH_VERSION",
  "NVIDIA_API_KEY",
  "NVIDIA_BASE_URL",
  "NVIDIA_ORDER_MODEL",
  "NVIDIA_IMAGE_API_KEY",
  "NVIDIA_IMAGE_BASE_URL",
  "NVIDIA_IMAGE_MODEL",
  "NVIDIA_IMAGE_WIDTH",
  "NVIDIA_IMAGE_HEIGHT",
  "NVIDIA_IMAGE_STEPS",
  "NVIDIA_IMAGE_CFG_SCALE",
  "NVIDIA_IMAGE_TIMEOUT_MS",
  "NVIDIA_IMAGE_GENERATION_ENABLED",
  "ALLOW_UNAPPROVED_AI_PRODUCT_IMAGES",
  "PRODUCT_IMAGE_MAX_BYTES",
  "MONNIFY_BASE_URL",
  "MONNIFY_API_KEY",
  "MONNIFY_SECRET_KEY",
  "MONNIFY_CONTRACT_CODE",
  "MONNIFY_SUBACCOUNT_ENABLED",
  "MONNIFY_PLATFORM_FEE_PERCENT",
  "CRON_SECRET",
  "DEMO_MODE",
  "ADMIN_EMAILS",
];

const envFile = path.join(process.cwd(), ".env.local");
if (!existsSync(envFile)) {
  console.error(".env.local not found — run `npm run secrets:import` first.");
  process.exit(1);
}
const values = {};
const text = readFileSync(envFile, "utf8").replace(/^﻿/, "");
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m) values[m[1]] = (m[2] ?? "").trim().replace(/^"(.*)"$/, "$1");
}

let pushed = 0;
let skipped = 0;
for (const key of PUSH_KEYS) {
  const value = values[key];
  if (value === undefined || value === "") {
    console.log(`skip  ${key} (empty)`);
    skipped++;
    continue;
  }
  if (DRY_RUN) {
    console.log(`would push ${key} → ${TARGET}`);
    continue;
  }
  // Remove any existing value first so `env add` doesn't fail.
  spawnSync("vercel", ["env", "rm", key, TARGET, "--yes"], {
    stdio: ["ignore", "ignore", "ignore"],
    shell: process.platform === "win32",
  });
  const result = spawnSync("vercel", ["env", "add", key, TARGET], {
    input: value,
    stdio: ["pipe", "ignore", "pipe"],
    shell: process.platform === "win32",
  });
  if (result.status === 0) {
    console.log(`push  ${key} → ${TARGET}`);
    pushed++;
  } else {
    console.error(`FAIL  ${key}: ${result.stderr?.toString().split("\n")[0] ?? "unknown error"}`);
  }
}
console.log(`Done. Pushed ${pushed}, skipped ${skipped}. Values were never printed.`);
