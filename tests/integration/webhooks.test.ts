import { afterAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { registerMonnifyEvent } from "@/lib/payments/webhook";

/**
 * Webhook route-level tests: signature enforcement (401s) and duplicate
 * suppression. Route handlers are imported and invoked directly.
 */

function metaSigned(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function monnifySigned(body: string, secret: string): string {
  return createHmac("sha512", secret).update(body).digest("hex");
}

const createdKeys: string[] = [];

afterAll(async () => {
  // No $disconnect here — the client is shared across test files.
  if (createdKeys.length) {
    await prisma.webhookEvent.deleteMany({
      where: { providerEventKey: { in: createdKeys } },
    });
  }
});

describe("WhatsApp webhook route", () => {
  it("GET returns the challenge for the correct verify token", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp/route");
    const token = process.env.WHATSAPP_VERIFY_TOKEN!;
    const request = new NextRequest(
      `http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=CHALLENGE_42`
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("CHALLENGE_42");
  });

  it("GET returns 403 for a wrong verify token", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp/route");
    const request = new NextRequest(
      "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x"
    );
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("POST returns 401 for an invalid signature", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const request = new NextRequest("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("POST returns 401 when the signature header is missing", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const request = new NextRequest("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body: "{}",
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("POST accepts a correctly signed empty payload", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const request = new NextRequest("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body,
      headers: {
        "x-hub-signature-256": metaSigned(
          body,
          process.env.WHATSAPP_APP_SECRET!
        ),
      },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});

describe("Monnify webhook route", () => {
  it("POST returns 401 for an invalid signature", async () => {
    const { POST } = await import("@/app/api/webhooks/monnify/route");
    const body = JSON.stringify({
      eventType: "SUCCESSFUL_TRANSACTION",
      eventData: { transactionReference: "MNFY|TEST|1" },
    });
    const request = new NextRequest("http://localhost/api/webhooks/monnify", {
      method: "POST",
      body,
      headers: { "monnify-signature": "bad" },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("duplicate events are stored once and flagged as duplicates", async () => {
    const reference = `MNFY-DUP-${Date.now()}`;
    const body = JSON.stringify({
      eventType: "SUCCESSFUL_TRANSACTION",
      eventData: { transactionReference: reference, paymentReference: "X" },
    });
    createdKeys.push(`monnify:SUCCESSFUL_TRANSACTION:${reference}`);

    const first = await registerMonnifyEvent(body);
    const second = await registerMonnifyEvent(body);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);

    const rows = await prisma.webhookEvent.findMany({
      where: { providerEventKey: first.eventKey! },
    });
    expect(rows).toHaveLength(1);
  });

  it("a signed duplicate delivery through the route responds 200 without reprocessing", async () => {
    const { POST } = await import("@/app/api/webhooks/monnify/route");
    const reference = `MNFY-DUP2-${Date.now()}`;
    const body = JSON.stringify({
      eventType: "SUCCESSFUL_TRANSACTION",
      eventData: { transactionReference: reference },
    });
    createdKeys.push(`monnify:SUCCESSFUL_TRANSACTION:${reference}`);
    const headers = {
      "monnify-signature": monnifySigned(body, process.env.MONNIFY_SECRET_KEY!),
    };

    const r1 = await POST(
      new NextRequest("http://localhost/api/webhooks/monnify", {
        method: "POST",
        body,
        headers,
      })
    );
    const r2 = await POST(
      new NextRequest("http://localhost/api/webhooks/monnify", {
        method: "POST",
        body,
        headers,
      })
    );
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as { duplicate?: boolean }).duplicate).toBe(true);

    const rows = await prisma.webhookEvent.findMany({
      where: { providerEventKey: `monnify:SUCCESSFUL_TRANSACTION:${reference}` },
    });
    expect(rows).toHaveLength(1);
  });
});
