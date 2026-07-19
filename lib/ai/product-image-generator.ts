import "server-only";

import { env } from "@/lib/env";
import { detectProductImageType } from "@/lib/product-images";

export type ProductImageGenerationInput = {
  name: string;
  category?: string | null;
  description?: string | null;
  colours: string[];
  sizes: string[];
  customPrompt?: string | null;
};

export type ProductImageGenerationOptions = {
  /** Total provider attempts, including the first request. */
  maxAttempts?: number;
  /** Per-attempt timeout. Background jobs use a shorter budget than manual generation. */
  timeoutMs?: number;
  /** FLUX.1-schnell supports 1-4 steps. */
  steps?: number;
  seed?: number;
};

export class ProductImageGenerationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "disabled"
      | "missing_key"
      | "invalid_prompt"
      | "permission_denied"
      | "credits_exhausted"
      | "rate_limited"
      | "provider_unavailable"
      | "invalid_response"
  ) {
    super(message);
    this.name = "ProductImageGenerationError";
  }
}

function buildPrompt(input: ProductImageGenerationInput): string {
  const custom = input.customPrompt?.trim();
  if (custom) return custom.slice(0, 1800);
  return [
    `Create a realistic ecommerce studio product illustration of ${input.name}.`,
    input.category ? `Category: ${input.category}.` : "",
    input.description ? `Description: ${input.description}.` : "",
    input.colours.length
      ? `Available colours: ${input.colours.join(", ")}.`
      : "",
    input.sizes.length ? `Available sizes: ${input.sizes.join(", ")}.` : "",
    "Centered single product, clean neutral background, soft studio lighting, accurate proportions, no people, no hands, no text, no logo, no watermark, no packaging claims, square composition.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1800);
}

type NvidiaResponse = {
  artifacts?: Array<{
    base64?: string;
    base64_image?: string;
    seed?: number;
    finishReason?: string;
  }>;
  data?: Array<{ b64_json?: string }>;
};

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export async function generateProductImage(
  input: ProductImageGenerationInput,
  options: ProductImageGenerationOptions = {}
): Promise<{
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  prompt: string;
  model: string;
  seed?: number;
}> {
  const config = env();
  if (!config.NVIDIA_IMAGE_GENERATION_ENABLED) {
    throw new ProductImageGenerationError(
      "NVIDIA product image generation is disabled.",
      "disabled"
    );
  }
  const apiKey = config.NVIDIA_IMAGE_API_KEY ?? config.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new ProductImageGenerationError(
      "NVIDIA image API key is not configured.",
      "missing_key"
    );
  }

  const prompt = buildPrompt(input);
  const endpoint = `${config.NVIDIA_IMAGE_BASE_URL.replace(/\/$/, "")}/v1/genai/${config.NVIDIA_IMAGE_MODEL}`;
  const maxAttempts = clampInteger(options.maxAttempts ?? 3, 1, 3);
  const timeoutMs = clampInteger(
    options.timeoutMs ?? config.NVIDIA_IMAGE_TIMEOUT_MS,
    5_000,
    120_000
  );
  const steps = clampInteger(options.steps ?? config.NVIDIA_IMAGE_STEPS, 1, 4);
  const seed = Math.max(0, Math.trunc(options.seed ?? 0));
  let lastStatus = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          width: config.NVIDIA_IMAGE_WIDTH,
          height: config.NVIDIA_IMAGE_HEIGHT,
          cfg_scale: 0,
          mode: "base",
          samples: 1,
          seed,
          steps,
        }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch {
      if (attempt < maxAttempts - 1) continue;
      throw new ProductImageGenerationError(
        "NVIDIA image generation could not be reached.",
        "provider_unavailable"
      );
    }

    lastStatus = response.status;
    if (response.ok) {
      const body = (await response.json()) as NvidiaResponse;
      const artifact = body.artifacts?.[0];
      const encoded =
        artifact?.base64 ??
        artifact?.base64_image ??
        body.data?.[0]?.b64_json ??
        "";
      const normalized = encoded.includes(",")
        ? encoded.slice(encoded.indexOf(",") + 1)
        : encoded;
      const bytes = Buffer.from(normalized, "base64");
      const contentType = detectProductImageType(bytes);
      if (!normalized || bytes.length < 100 || !contentType) {
        throw new ProductImageGenerationError(
          "NVIDIA returned an invalid image payload.",
          "invalid_response"
        );
      }
      return {
        bytes,
        contentType,
        prompt,
        model: config.NVIDIA_IMAGE_MODEL,
        seed: artifact?.seed,
      };
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(800 * 2 ** attempt, 3000))
        );
        continue;
      }
    }
    break;
  }

  if (lastStatus === 400 || lastStatus === 422) {
    throw new ProductImageGenerationError(
      "The product image prompt was rejected.",
      "invalid_prompt"
    );
  }
  if (lastStatus === 401 || lastStatus === 403) {
    throw new ProductImageGenerationError(
      "The NVIDIA image API key does not have access.",
      "permission_denied"
    );
  }
  if (lastStatus === 402) {
    throw new ProductImageGenerationError(
      "NVIDIA image-generation credits are unavailable.",
      "credits_exhausted"
    );
  }
  if (lastStatus === 429) {
    throw new ProductImageGenerationError(
      "NVIDIA image generation is temporarily rate limited.",
      "rate_limited"
    );
  }
  throw new ProductImageGenerationError(
    "NVIDIA image generation is currently unavailable.",
    "provider_unavailable"
  );
}
