import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Load .env and .env.local (BOM-tolerant) so integration tests reach the
// local dev database. Values already present in the environment win.
for (const file of [".env", ".env.local"]) {
  const full = path.join(process.cwd(), file);
  if (!existsSync(full)) continue;
  const text = readFileSync(full, "utf8").replace(/^﻿/, "");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m && m[1] && process.env[m[1]] === undefined) {
      process.env[m[1]] = (m[2] ?? "").trim().replace(/^"(.*)"$/, "$1");
    }
  }
}

// Tests must never talk to real providers.
(process.env as Record<string, string>).NODE_ENV = "test";

// The free-tier Prisma Postgres endpoint auto-pauses when idle and its first
// connection while resuming can fail. Warm it up (with retries) before any test
// file's own beforeAll runs, so cold-starts don't skip whole suites.
import { beforeAll } from "vitest";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const { prisma } = await import("@/lib/db");
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}, 60_000);
