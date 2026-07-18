const key = process.env.NVIDIA_IMAGE_API_KEY || process.env.NVIDIA_API_KEY;
const baseUrl = (process.env.NVIDIA_IMAGE_BASE_URL || "https://ai.api.nvidia.com").replace(/\/$/, "");
const model = process.env.NVIDIA_IMAGE_MODEL || "black-forest-labs/flux.1-schnell";

if (!key) {
  console.log("NVIDIA image probe: skipped (no server-side key configured)");
  process.exit(0);
}

try {
  const response = await fetch(`${baseUrl}/v1/genai/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt:
        "A simple clean ecommerce studio product illustration of a plain reflective safety vest on a neutral background, no person, no text, no logo, square composition",
      width: 1024,
      height: 1024,
      samples: 1,
      seed: 0,
      steps: 4,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  const body = await response.json().catch(() => ({}));
  const artifact = body?.artifacts?.[0];
  const encoded =
    artifact?.base64 ||
    artifact?.base64_image ||
    body?.data?.[0]?.b64_json ||
    "";

  if (response.ok && typeof encoded === "string" && encoded.length > 100) {
    console.log("NVIDIA image probe: success (image payload received)");
  } else {
    const providerMessage =
      typeof body?.error?.message === "string"
        ? body.error.message.slice(0, 240)
        : "no image artifact returned";
    console.log(
      `NVIDIA image probe: failed (HTTP ${response.status}; ${providerMessage})`
    );
  }
} catch (error) {
  console.log(
    `NVIDIA image probe: failed (${error instanceof Error ? error.message : "unknown error"})`
  );
}
