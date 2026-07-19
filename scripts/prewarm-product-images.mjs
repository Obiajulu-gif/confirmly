#!/usr/bin/env node
/**
 * Triggers a full product-image pre-generation sweep on the deployed app.
 *
 * Generation runs server-side on Vercel (where the NVIDIA image API is
 * reachable with a good network), so this works even when a local machine
 * can't reach the image host. Requires CRON_SECRET in .env.local and a
 * reachable APP_URL.
 *
 *   npm run images:prewarm
 *   node scripts/prewarm-product-images.mjs https://confirmly-alpha.vercel.app
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnv(file) {
  const full = path.join(process.cwd(), file);
  if (!existsSync(full)) return {};
  const out = {};
  for (const line of readFileSync(full, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = (m[2] ?? "").trim().replace(/^"(.*)"$/, "$1");
  }
  return out;
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local") };
const base = (process.argv[2] ?? env.APP_URL ?? "https://confirmly-alpha.vercel.app")
  .replace(/\/$/, "");
const secret = env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is not set in .env.local — cannot authorize the sweep.");
  process.exit(1);
}

console.log(`Pre-generating product images via ${base} …`);
let round = 0;
let remaining = Infinity;
const totals = { generated: 0, approved: 0, failed: 0 };

while (round < 40) {
  round += 1;
  let data;
  try {
    const r = await fetch(`${base}/api/product-images/prewarm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    data = await r.json();
    if (!r.ok) {
      console.error(`Request failed: HTTP ${r.status} ${JSON.stringify(data)}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Network error: ${err.message}`);
    process.exit(1);
  }
  if (data.disabled) {
    console.error(
      "Image generation is disabled (NVIDIA_IMAGE_GENERATION_ENABLED=false or no key)."
    );
    process.exit(1);
  }
  totals.generated += data.generated ?? 0;
  totals.approved += data.approved ?? 0;
  totals.failed += data.failed ?? 0;
  remaining = data.remaining ?? 0;
  console.log(
    `  round ${round}: generated ${data.generated}, approved ${data.approved}, failed ${data.failed}, remaining ${remaining}`
  );
  if (remaining === 0) break;
  if ((data.generated ?? 0) === 0 && (data.approved ?? 0) === 0) {
    // No forward progress this round (all failing or rate-limited) — stop.
    break;
  }
}

console.log(
  `\nDone. Generated ${totals.generated}, approved ${totals.approved}, failed ${totals.failed}. ${remaining} product(s) still without an image.`
);
process.exit(remaining === 0 ? 0 : 2);
