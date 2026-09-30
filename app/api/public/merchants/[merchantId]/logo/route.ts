import { NextResponse } from "next/server";
import { getStoreLogoAsset } from "@/lib/store-logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ merchantId: string }> };

/** Serves a merchant's uploaded store logo (used for dashboard preview). */
export async function GET(_request: Request, context: Context) {
  const { merchantId } = await context.params;
  const asset = await getStoreLogoAsset(merchantId);
  if (!asset) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
