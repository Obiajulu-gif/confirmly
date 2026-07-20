import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env, integrationStatus, isDemoMode } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SchemaCheck = {
  userTable: string | null;
  merchantTable: string | null;
  waSessionTable: string | null;
  webhookEventTable: string | null;
};

/** Public health check — names and boolean state only, never secret values or phone numbers. */
export async function GET() {
  const integrations = integrationStatus();
  let connected = false;
  let schemaReady = false;
  let whatsappDelivery: {
    ready: boolean;
    reason: "recipient_not_allowed" | "processing_failed" | null;
    lastEventAt: string | null;
  } = { ready: true, reason: null, lastEventAt: null };

  try {
    const rows = await prisma.$queryRaw<SchemaCheck[]>`
      SELECT
        to_regclass('public."User"')::text AS "userTable",
        to_regclass('public."Merchant"')::text AS "merchantTable",
        to_regclass('public."WaSession"')::text AS "waSessionTable",
        to_regclass('public."WebhookEvent"')::text AS "webhookEventTable"
    `;
    connected = true;
    const schema = rows[0];
    schemaReady = Boolean(
      schema?.userTable &&
        schema.merchantTable &&
        schema.waSessionTable &&
        schema.webhookEventTable
    );

    if (schemaReady) {
      const latestWhatsAppEvent = await prisma.webhookEvent.findFirst({
        where: { provider: "WHATSAPP" },
        orderBy: { createdAt: "desc" },
        select: { state: true, errorSummary: true, createdAt: true },
      });

      if (latestWhatsAppEvent) {
        const recipientBlocked =
          latestWhatsAppEvent.state === "FAILED" &&
          /131030|recipient phone number not in allowed list/i.test(
            latestWhatsAppEvent.errorSummary ?? ""
          );
        whatsappDelivery = {
          ready: latestWhatsAppEvent.state !== "FAILED",
          reason: recipientBlocked
            ? "recipient_not_allowed"
            : latestWhatsAppEvent.state === "FAILED"
              ? "processing_failed"
              : null,
          lastEventAt: latestWhatsAppEvent.createdAt.toISOString(),
        };
      }
    }
  } catch {
    connected = false;
    schemaReady = false;
  }

  return NextResponse.json(
    {
      ok: connected && schemaReady,
      demoMode: isDemoMode(),
      database: { connected, schemaReady },
      integrations: {
        whatsapp: {
          ...integrations.whatsapp,
          delivery: whatsappDelivery,
        },
        nvidia: integrations.nvidia,
        monnify: integrations.monnify,
        productImages: {
          storage: "database",
          generationEnabled: env().NVIDIA_IMAGE_GENERATION_ENABLED,
          nvidiaConfigured: Boolean(
            env().NVIDIA_IMAGE_API_KEY ?? env().NVIDIA_API_KEY
          ),
          model: env().NVIDIA_IMAGE_MODEL,
          steps: env().NVIDIA_IMAGE_STEPS,
        },
      },
      time: new Date().toISOString(),
    },
    { status: connected && schemaReady ? 200 : 503 }
  );
}
