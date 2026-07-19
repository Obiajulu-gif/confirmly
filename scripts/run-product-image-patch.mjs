import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const scripts = [
  "scripts/finalize-product-images.py",
  "scripts/finalize-whatsapp-prewarm.py",
];

const commandCandidates =
  process.platform === "win32"
    ? [
        ["python", []],
        ["py", ["-3"]],
      ]
    : [
        ["python3", []],
        ["python", []],
      ];

for (const script of scripts) {
  let completed = false;
  let lastError = null;

  for (const [command, prefixArgs] of commandCandidates) {
    const result = spawnSync(command, [...prefixArgs, script], {
      stdio: "inherit",
      shell: false,
      env: process.env,
    });
    if (!result.error && result.status === 0) {
      completed = true;
      break;
    }
    lastError = result.error ?? new Error(`${command} exited with ${result.status}`);
    if (result.error?.code !== "ENOENT") break;
  }

  if (!completed) {
    console.error(`Unable to apply integration patch: ${script}`);
    if (lastError) console.error(lastError.message);
    process.exit(1);
  }
}

// Manual merchant generation can use the longer budget. Scheduled prewarming
// supplies its own shorter timeout so a Hobby function remains within 60s.
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
