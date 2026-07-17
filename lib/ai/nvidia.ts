import "server-only";
import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { orderIntentSchema, type OrderIntent } from "@/lib/ai/schema";
import { buildExtractionSystemPrompt, buildRepairPrompt } from "@/lib/ai/prompts";
import { fallbackExtract } from "@/lib/ai/fallback";

/**
 * NVIDIA NIM (OpenAI-compatible) order-intent extraction.
 *
 * Reliability policy:
 *  - temperature 0.15, ~20s timeout
 *  - up to 2 retries on transient failures (429/5xx/network)
 *  - one JSON-repair round trip on malformed output
 *  - Zod validation of everything the model returns
 *  - deterministic fallback parser when the model is unavailable
 */

const TIMEOUT_MS = 20_000;
const TRANSIENT_RETRIES = 2;

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const e = requireEnv("NVIDIA_API_KEY");
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= TRANSIENT_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
    try {
      const response = await fetch(`${e.NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${e.NVIDIA_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: e.NVIDIA_ORDER_MODEL,
          messages,
          temperature: 0.15,
          max_tokens: 1024,
          stream: false,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`NVIDIA transient error: HTTP ${response.status}`);
        continue;
      }
      if (!response.ok) {
        throw new Error(`NVIDIA request failed: HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("NVIDIA returned an empty completion");
      return content;
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        lastError = err;
        continue; // timeouts are transient
      }
      if (err instanceof TypeError) {
        lastError = err; // fetch network failure
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error("NVIDIA request failed");
}

/**
 * Extracts a JSON object from model output. Tolerates markdown fences and
 * stray prose around the object (never chain-of-thought — we just locate the
 * outermost braces).
 */
export function extractJsonObject(text: string): string | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

export interface ExtractionResult {
  intent: OrderIntent;
  source: "nvidia" | "nvidia-repaired" | "fallback";
}

export async function extractOrderIntent(
  message: string,
  catalogueHint: string
): Promise<ExtractionResult> {
  const system = buildExtractionSystemPrompt(catalogueHint);

  let raw: string;
  try {
    raw = await chatCompletion([
      { role: "system", content: system },
      { role: "user", content: message },
    ]);
  } catch (err) {
    logger.warn("nvidia unavailable, using deterministic fallback", {
      reason: err instanceof Error ? err.message : "unknown",
    });
    return { intent: fallbackExtract(message), source: "fallback" };
  }

  const first = tryParse(raw);
  if (first) return { intent: first, source: "nvidia" };

  // One JSON-repair attempt.
  try {
    const repaired = await chatCompletion([
      { role: "user", content: buildRepairPrompt(raw) },
    ]);
    const second = tryParse(repaired);
    if (second) return { intent: second, source: "nvidia-repaired" };
  } catch {
    /* fall through to deterministic fallback */
  }

  logger.warn("nvidia output failed validation twice, using fallback");
  return { intent: fallbackExtract(message), source: "fallback" };
}

function tryParse(raw: string): OrderIntent | null {
  const json = extractJsonObject(raw);
  if (!json) return null;
  try {
    const parsed = orderIntentSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Lightweight connectivity check for the settings/health page. */
export async function nvidiaHealthCheck(): Promise<boolean> {
  try {
    const e = requireEnv("NVIDIA_API_KEY");
    const response = await fetch(`${e.NVIDIA_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${e.NVIDIA_API_KEY}` },
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
