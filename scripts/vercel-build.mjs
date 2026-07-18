import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const npmCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const nodeCommand = process.platform === "win32" ? "node.exe" : "node";

// Keep local, preview and production builds on the same idempotent image schema.
run(nodeCommand, ["scripts/run-product-image-patch.mjs"]);
run(npmCommand, ["prisma", "generate"]);

if (process.env.DATABASE_URL?.trim()) {
  console.log(
    "DATABASE_URL is configured; applying migrations and idempotent seed data."
  );
  run(npmCommand, ["prisma", "migrate", "deploy"]);
  // Existing user-created stores may already own a demo store code while using
  // an older slug. Reconcile that identity before Prisma's slug-based upserts.
  run(nodeCommand, ["scripts/reconcile-demo-store-slugs.mjs"]);
  run(npmCommand, ["prisma", "db", "seed"]);
} else {
  console.warn(
    "DATABASE_URL is not configured for this deployment environment; skipping migrations and seed."
  );
}

if (process.env.VERCEL_ENV === "production") {
  run(nodeCommand, ["scripts/probe-nvidia-image.mjs"]);
}

run(npmCommand, ["next", "build"]);
