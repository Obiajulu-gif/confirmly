import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { integrationStatus, isDemoMode } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public health check — names only, never values. */
export async function GET() {
  const integrations = integrationStatus();
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }
  return NextResponse.json({
    ok: database,
    demoMode: isDemoMode(),
    database: { connected: database },
    integrations: {
      whatsapp: integrations.whatsapp,
      nvidia: integrations.nvidia,
      monnify: integrations.monnify,
    },
    time: new Date().toISOString(),
  });
}
