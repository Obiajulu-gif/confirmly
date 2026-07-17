import { describe, expect, it } from "vitest";
import { parseWebhookPayload, waWebhookSchema } from "@/lib/whatsapp/types";
import metaTextFixture from "../fixtures/wa-inbound-text.json";

describe("WhatsApp webhook parsing", () => {
  it("parses a text message with contact profile", () => {
    const parsed = waWebhookSchema.parse(metaTextFixture);
    const webhook = parseWebhookPayload(parsed);
    expect(webhook.phoneNumberId).toBe("111111111111111");
    expect(webhook.messages).toHaveLength(1);
    const message = webhook.messages[0]!;
    expect(message.kind).toBe("text");
    expect(message.text).toBe(
      "I need two black polo shirts, large size, delivered to Yaba."
    );
    expect(message.profileName).toBe("Test Customer");
    expect(message.providerMessageId).toBe("wamid.TEST123");
  });

  it("parses interactive button replies", () => {
    const payload = structuredClone(metaTextFixture) as unknown as Record<
      string,
      never
    >;
    const value = (payload as unknown as {
      entry: Array<{ changes: Array<{ value: { messages: unknown[] } }> }>;
    }).entry[0]!.changes[0]!.value;
    value.messages = [
      {
        id: "wamid.BTN1",
        from: "2348099999999",
        timestamp: "1737000000",
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: "confirm_order", title: "Confirm order" },
        },
      },
    ];
    const webhook = parseWebhookPayload(waWebhookSchema.parse(payload));
    expect(webhook.messages[0]?.kind).toBe("button_reply");
    expect(webhook.messages[0]?.interactiveId).toBe("confirm_order");
  });

  it("parses status updates", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "1",
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  { id: "wamid.OUT1", status: "delivered", timestamp: "1737000001" },
                ],
              },
            },
          ],
        },
      ],
    };
    const webhook = parseWebhookPayload(waWebhookSchema.parse(payload));
    expect(webhook.statuses).toHaveLength(1);
    expect(webhook.statuses[0]?.status).toBe("delivered");
  });

  it("marks unknown message types unsupported instead of crashing", () => {
    const payload = structuredClone(metaTextFixture) as unknown as Record<
      string,
      never
    >;
    const value = (payload as unknown as {
      entry: Array<{ changes: Array<{ value: { messages: unknown[] } }> }>;
    }).entry[0]!.changes[0]!.value;
    value.messages = [
      { id: "wamid.IMG1", from: "234", timestamp: "1737000000", type: "image" },
    ];
    const webhook = parseWebhookPayload(waWebhookSchema.parse(payload));
    expect(webhook.messages[0]?.kind).toBe("unsupported");
  });
});
