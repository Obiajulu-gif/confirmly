import "server-only";
import { env, requireEnv } from "@/lib/env";
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

export interface SendResult {
  providerMessageId: string;
}

function graphUrl(): string {
  const e = requireEnv("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID");
  return `https://graph.facebook.com/${e.WHATSAPP_GRAPH_VERSION}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

/**
 * Resolves the actual WhatsApp display number used in wa.me links.
 * `WHATSAPP_PHONE_NUMBER_ID` is an API resource id, not a telephone number.
 */
export async function resolveWhatsAppPublicNumber(): Promise<string | null> {
  const configured = (env().WHATSAPP_PUBLIC_NUMBER ?? "").replace(/\D/g, "");
  if (configured.length >= 7) return configured;

  try {
    const e = requireEnv("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID");
    const response = await fetch(
      `https://graph.facebook.com/${e.WHATSAPP_GRAPH_VERSION}/${e.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number`,
      {
        headers: { Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      }
    );
    if (!response.ok) {
      logger.warn("could not resolve WhatsApp display number", {
        status: response.status,
      });
      return null;
    }
    const data = (await response.json()) as { display_phone_number?: string };
    const digits = (data.display_phone_number ?? "").replace(/\D/g, "");
    return digits.length >= 7 ? digits : null;
  } catch (err) {
    logger.warn("could not resolve WhatsApp display number", {
      reason: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

async function post(body: Record<string, unknown>): Promise<SendResult> {
  const e = requireEnv("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID");
  let lastError: WhatsAppSendError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), 5_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
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
      continue;
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
      // Non-JSON provider error.
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
  title: string;
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
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((button) => ({
          type: "reply",
          reply: { id: button.id, title: button.title.slice(0, 20) },
        })),
      },
    },
  });
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
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
      body: { text: bodyText.slice(0, 1024) },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [
          {
            title: "Options",
            rows: rows.slice(0, 10).map((row) => ({
              id: row.id.slice(0, 200),
              title: row.title.slice(0, 24),
              description: row.description?.slice(0, 72),
            })),
          },
        ],
      },
    },
  });
}

/**
 * Sends a published WhatsApp Flow. The caller must supply a high-entropy
 * flow token. When Flow configuration is unavailable the commerce layer falls
 * back to interactive lists instead of pretending the Flow was delivered.
 */
export async function sendFlow(
  to: string,
  input: {
    flowId: string;
    flowToken: string;
    bodyText: string;
    cta: string;
    screen?: string;
    data?: Record<string, unknown>;
  }
): Promise<SendResult> {
  return post({
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: input.bodyText.slice(0, 1024) },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: input.flowToken,
          flow_id: input.flowId,
          flow_cta: input.cta.slice(0, 20),
          flow_action: "navigate",
          ...(input.screen
            ? {
                flow_action_payload: {
                  screen: input.screen,
                  data: input.data ?? {},
                },
              }
            : {}),
        },
      },
    },
  });
}

export async function markMessageRead(
  providerMessageId: string
): Promise<SendResult> {
  return post({
    status: "read",
    message_id: providerMessageId,
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
