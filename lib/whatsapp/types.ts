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
    nfm_reply: z
      .object({
        name: z.string().optional(),
        body: z.string().optional(),
        response_json: z.string(),
      })
      .optional(),
  }),
});

export const waLocationMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.literal("location"),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    name: z.string().optional(),
    address: z.string().optional(),
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
  waLocationMessageSchema,
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
  from: string;
  profileName: string | null;
  timestamp: Date;
  kind:
    | "text"
    | "button_reply"
    | "list_reply"
    | "flow_reply"
    | "location"
    | "unsupported";
  text: string | null;
  /** For button/list replies, the developer-defined identifier. */
  interactiveId: string | null;
  location: {
    latitude: number;
    longitude: number;
    name: string | null;
    address: string | null;
  } | null;
  flowResponse: Record<string, unknown> | null;
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

function parseFlowResponse(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Flattens a validated webhook payload into inbound messages + statuses. */
export function parseWebhookPayload(payload: WaWebhookPayload): ParsedWebhook {
  const out: ParsedWebhook = { phoneNumberId: null, messages: [], statuses: [] };

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const value = change.value;
      out.phoneNumberId = value.metadata?.phone_number_id ?? out.phoneNumberId;
      const profileName = value.contacts?.[0]?.profile?.name ?? null;

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
            location: null,
            flowResponse: null,
            rawType: "text",
          });
        } else if ("location" in msg && msg.type === "location") {
          out.messages.push({
            providerMessageId: msg.id,
            from: msg.from,
            profileName,
            timestamp,
            kind: "location",
            text: msg.location.name ?? msg.location.address ?? null,
            interactiveId: null,
            location: {
              latitude: msg.location.latitude,
              longitude: msg.location.longitude,
              name: msg.location.name ?? null,
              address: msg.location.address ?? null,
            },
            flowResponse: null,
            rawType: "location",
          });
        } else if ("interactive" in msg && msg.type === "interactive") {
          if (msg.interactive.nfm_reply) {
            out.messages.push({
              providerMessageId: msg.id,
              from: msg.from,
              profileName,
              timestamp,
              kind: "flow_reply",
              text: msg.interactive.nfm_reply.body ?? null,
              interactiveId: msg.interactive.nfm_reply.name ?? "flow_reply",
              location: null,
              flowResponse: parseFlowResponse(
                msg.interactive.nfm_reply.response_json
              ),
              rawType: "interactive.nfm_reply",
            });
          } else {
            const reply =
              msg.interactive.button_reply ?? msg.interactive.list_reply;
            out.messages.push({
              providerMessageId: msg.id,
              from: msg.from,
              profileName,
              timestamp,
              kind: msg.interactive.button_reply
                ? "button_reply"
                : "list_reply",
              text: reply?.title ?? null,
              interactiveId: reply?.id ?? null,
              location: null,
              flowResponse: null,
              rawType: "interactive",
            });
          }
        } else {
          out.messages.push({
            providerMessageId: msg.id,
            from: msg.from,
            profileName,
            timestamp,
            kind: "unsupported",
            text: null,
            interactiveId: null,
            location: null,
            flowResponse: null,
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

/** Removes fields we never store (raw contacts, coordinates, addresses, etc.). */
export function sanitizeInboundPayload(message: ParsedInboundMessage) {
  return {
    providerMessageId: message.providerMessageId,
    kind: message.kind,
    rawType: message.rawType,
    interactiveId: message.interactiveId,
    hasText: message.text !== null,
    hasLocation: message.location !== null,
    hasFlowResponse: message.flowResponse !== null,
    timestamp: message.timestamp.toISOString(),
  };
}
