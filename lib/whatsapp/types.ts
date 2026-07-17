import { z } from "zod";

/**
 * Zod schemas for the WhatsApp Cloud API webhook payload. Deliberately
 * permissive (passthrough) — Meta adds fields over time; we validate only
 * what we consume.
 */

export const waTextMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.literal("text"),
  text: z.object({ body: z.string() }),
});

export const waInteractiveMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.literal("interactive"),
  interactive: z.object({
    type: z.string(),
    button_reply: z
      .object({ id: z.string(), title: z.string() })
      .optional(),
    list_reply: z
      .object({ id: z.string(), title: z.string() })
      .optional(),
  }),
});

export const waOtherMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.string(),
});

export const waMessageSchema = z.union([
  waTextMessageSchema,
  waInteractiveMessageSchema,
  waOtherMessageSchema,
]);

export const waStatusSchema = z.object({
  id: z.string(),
  status: z.string(),
  timestamp: z.string(),
  recipient_id: z.string().optional(),
});

export const waWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            messaging_product: z.string().optional(),
            metadata: z
              .object({
                display_phone_number: z.string().optional(),
                phone_number_id: z.string().optional(),
              })
              .optional(),
            contacts: z
              .array(
                z.object({
                  wa_id: z.string(),
                  profile: z.object({ name: z.string().optional() }).optional(),
                })
              )
              .optional(),
            messages: z.array(z.unknown()).optional(),
            statuses: z.array(z.unknown()).optional(),
          }),
        })
      ),
    })
  ),
});

export type WaWebhookPayload = z.infer<typeof waWebhookSchema>;

export interface ParsedInboundMessage {
  providerMessageId: string;
  from: string; // wa_id
  profileName: string | null;
  timestamp: Date;
  kind: "text" | "button_reply" | "list_reply" | "unsupported";
  text: string | null;
  /** For button/list replies, the developer-defined identifier. */
  interactiveId: string | null;
  rawType: string;
}

export interface ParsedStatusUpdate {
  providerMessageId: string;
  status: string;
  timestamp: Date;
}

export interface ParsedWebhook {
  phoneNumberId: string | null;
  messages: ParsedInboundMessage[];
  statuses: ParsedStatusUpdate[];
}

/** Flattens a validated webhook payload into inbound messages + statuses. */
export function parseWebhookPayload(payload: WaWebhookPayload): ParsedWebhook {
  const out: ParsedWebhook = { phoneNumberId: null, messages: [], statuses: [] };

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const value = change.value;
      out.phoneNumberId = value.metadata?.phone_number_id ?? out.phoneNumberId;
      const profileName =
        value.contacts?.[0]?.profile?.name ?? null;

      for (const raw of value.messages ?? []) {
        const parsed = waMessageSchema.safeParse(raw);
        if (!parsed.success) continue;
        const msg = parsed.data;
        const timestamp = new Date(Number(msg.timestamp) * 1000);

        if ("text" in msg && msg.type === "text") {
          out.messages.push({
            providerMessageId: msg.id,
            from: msg.from,
            profileName,
            timestamp,
            kind: "text",
            text: msg.text.body,
            interactiveId: null,
            rawType: "text",
          });
        } else if ("interactive" in msg && msg.type === "interactive") {
          const reply =
            msg.interactive.button_reply ?? msg.interactive.list_reply;
          out.messages.push({
            providerMessageId: msg.id,
            from: msg.from,
            profileName,
            timestamp,
            kind: msg.interactive.button_reply ? "button_reply" : "list_reply",
            text: reply?.title ?? null,
            interactiveId: reply?.id ?? null,
            rawType: "interactive",
          });
        } else {
          out.messages.push({
            providerMessageId: msg.id,
            from: msg.from,
            profileName,
            timestamp,
            kind: "unsupported",
            text: null,
            interactiveId: null,
            rawType: msg.type,
          });
        }
      }

      for (const raw of value.statuses ?? []) {
        const parsed = waStatusSchema.safeParse(raw);
        if (!parsed.success) continue;
        out.statuses.push({
          providerMessageId: parsed.data.id,
          status: parsed.data.status,
          timestamp: new Date(Number(parsed.data.timestamp) * 1000),
        });
      }
    }
  }
  return out;
}

/** Removes fields we never store (raw contacts, etc.) for auditing. */
export function sanitizeInboundPayload(message: ParsedInboundMessage) {
  return {
    providerMessageId: message.providerMessageId,
    kind: message.kind,
    rawType: message.rawType,
    interactiveId: message.interactiveId,
    hasText: message.text !== null,
    timestamp: message.timestamp.toISOString(),
  };
}
