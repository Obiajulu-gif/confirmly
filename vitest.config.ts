import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // The local Prisma Postgres dev server multiplexes onto a single PGlite
    // instance — run every file in one worker with a shared module registry
    // so only one PrismaClient (one connection) ever exists.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    isolate: false,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
