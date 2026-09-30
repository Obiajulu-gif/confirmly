import { NextResponse } from "next/server";
import { getDashboardScope } from "@/lib/business/scope";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { renderStoreFlyer } from "@/lib/flyers/store-flyer";
import { buildWaLink } from "@/lib/orders/onboarding";
import { getStoreLogoAsset } from "@/lib/store-logo";
import { resolveWhatsAppPublicNumber } from "@/lib/whatsapp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ branchId: string }> };

/** "2347044860938" → "0704 486 0938"; other formats are left readable. */
function localNumber(digits: string): string {
  const local = digits.startsWith("234") && digits.length === 13 ? `0${digits.slice(3)}` : digits;
  return local.length === 11 ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : `+${digits}`;
}

/**
 * The "we've joined Confirmly" flyer for one of the signed-in business's
 * branches, as a PNG. `?download=1` serves it as an attachment.
 */
export async function GET(request: Request, context: Context) {
  const { branchId } = await context.params;
  const scope = await getDashboardScope();
  if (!scope) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!scope.branchIds.includes(branchId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const branch = await prisma.merchant.findUnique({
    where: { id: branchId },
    select: { name: true, storeCode: true },
  });
  if (!branch) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const [digits, logo] = await Promise.all([
      resolveWhatsAppPublicNumber().catch(() => null),
      getStoreLogoAsset(branchId).catch(() => null),
    ]);
    const png = await renderStoreFlyer({
      storeName: branch.name,
      storeCode: branch.storeCode,
      logo: logo?.bytes ?? null,
      waLink: digits ? buildWaLink(branch.storeCode, digits) : null,
      whatsappNumber: digits ? localNumber(digits) : null,
    });

    const download = new URL(request.url).searchParams.get("download") === "1";
    const filename = `confirmly-flyer-${branch.storeCode.toLowerCase()}.png`;
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        // Private: reflects the current logo/name, and sits behind login.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    logger.error("store flyer render failed", {
      branchId,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "render_failed" }, { status: 500 });
  }
}
