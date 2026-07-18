import { spawnSync } from "node:child_process";

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

let lastError = null;
for (const [command, args] of candidates) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (!result.error && result.status === 0) process.exit(0);
  lastError = result.error ?? new Error(`${command} exited with ${result.status}`);
  if (result.error?.code !== "ENOENT") break;
}

console.error("Unable to apply the product-image integration patch.");
if (lastError) console.error(lastError.message);
process.exit(1);
