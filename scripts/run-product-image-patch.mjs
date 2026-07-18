import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const candidates =
  process.platform === "win32"
    ? [
        ["python", ["scripts/finalize-product-images.py"]],
        ["py", ["-3", "scripts/finalize-product-images.py"]],
      ]
    : [
        ["python3", ["scripts/finalize-product-images.py"]],
        ["python", ["scripts/finalize-product-images.py"]],
      ];

let applied = false;
let lastError = null;
for (const [command, args] of candidates) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (!result.error && result.status === 0) {
    applied = true;
    break;
  }
  lastError = result.error ?? new Error(`${command} exited with ${result.status}`);
  if (result.error?.code !== "ENOENT") break;
}

if (!applied) {
  console.error("Unable to apply the product-image integration patch.");
  if (lastError) console.error(lastError.message);
  process.exit(1);
}

// Hosted image models can require a cold start. Keep the server timeout below
// the route's maxDuration while allowing substantially more than a chat call.
const envPath = "lib/env.ts";
let envText = readFileSync(envPath, "utf8");
envText = envText.replace(
  ".min(5_000).max(120_000).default(45_000)",
  ".min(5_000).max(180_000).default(120_000)"
);
writeFileSync(envPath, envText, "utf8");

const examplePath = ".env.example";
let example = readFileSync(examplePath, "utf8");
example = example.replace(
  "NVIDIA_IMAGE_TIMEOUT_MS=45000",
  "NVIDIA_IMAGE_TIMEOUT_MS=120000"
);
writeFileSync(examplePath, example, "utf8");
