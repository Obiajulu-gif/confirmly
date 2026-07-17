import "server-only";
import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Thin WhatsApp Cloud API client. Server-side only.
 * Retries transient 429/5xx failures with capped exponential backoff.
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 600;

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly errorCode: number | null
  ) {
    super(message);
    this.name = "WhatsAppSendError";
  }
}

interface SendResult {
  providerMessageId: string;
}

function graphUrl(): string {
  const e = requireEnv("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID");
  return `https://graph.facebook.com/${e.WHATSAPP_GRAPH_VERSION}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

async function post(body: Record<string, unknown>): Promise<SendResult> {
  const e = requireEnv("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID");
  let lastError: WhatsAppSendError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), 5_000);
      await new Promise((r) => setTimeout(r, delay));
    }
    let response: Response;
    try {
      response = await fetch(graphUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          ...body,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      lastError = new WhatsAppSendError(
        `network error: ${err instanceof Error ? err.message : "unknown"}`,
        null,
        null
      );
      continue; // network errors are retryable
    }

    if (response.ok) {
      const data = (await response.json()) as {
        messages?: Array<{ id: string }>;
      };
      const id = data.messages?.[0]?.id;
      if (!id) {
        throw new WhatsAppSendError("no message id in response", 200, null);
      }
      return { providerMessageId: id };
    }

    let errorCode: number | null = null;
    let errorMessage = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as {
        error?: { code?: number; message?: string };
      };
      errorCode = data.error?.code ?? null;
      errorMessage = data.error?.message ?? errorMessage;
    } catch {
      /* non-JSON error body */
    }
    lastError = new WhatsAppSendError(errorMessage, response.status, errorCode);

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable) break;
    logger.warn("whatsapp send retry", {
      attempt,
      status: response.status,
    });
  }
  throw lastError ?? new WhatsAppSendError("send failed", null, null);
}

export async function sendText(to: string, body: string): Promise<SendResult> {
  return post({ to, type: "text", text: { body, preview_url: true } });
}

export interface InteractiveButton {
  id: string;
  title: string; // max 20 chars
}

export async function sendButtons(
  to: string,
  bodyText: string,
  buttons: InteractiveButton[]
): Promise<SendResult> {
  return post({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

export interface ListRow {
  id: string;
  title: string; // max 24 chars
  description?: string; // max 72 chars
}

export async function sendList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  rows: ListRow[]
): Promise<SendResult> {
  return post({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [
          {
            title: "Options",
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              description: r.description?.slice(0, 72),
            })),
          },
        ],
      },
    },
  });
}

/** Sends the pre-approved hello_world template (Meta test number default). */
export async function sendTemplate(
  to: string,
  templateName = "hello_world",
  languageCode = "en_US"
): Promise<SendResult> {
  return post({
    to,
    type: "template",
    template: { name: templateName, language: { code: languageCode } },
  });
}
