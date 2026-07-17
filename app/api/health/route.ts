import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { integrationStatus, isDemoMode } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SchemaCheck = {
  userTable: string | null;
  merchantTable: string | null;
  waSessionTable: string | null;
  webhookEventTable: string | null;
};

/** Public health check — names and boolean state only, never secret values. */
export async function GET() {
  const integrations = integrationStatus();
  let connected = false;
  let schemaReady = false;

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
        whatsapp: integrations.whatsapp,
        nvidia: integrations.nvidia,
        monnify: integrations.monnify,
      },
      time: new Date().toISOString(),
    },
    { status: connected && schemaReady ? 200 : 503 }
  );
}
