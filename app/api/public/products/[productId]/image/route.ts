import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ productId: string }> };

export async function GET(_request: Request, context: Context) {
  const { productId } = await context.params;
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      active: true,
      merchant: { active: true },
    },
    select: {
      imageUrl: true,
      imageSource: true,
      imageAsset: {
        select: {
          bytes: true,
          contentType: true,
          sha256: true,
        },
      },
    },
  });
  if (!product) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (product.imageAsset) {
    return new NextResponse(product.imageAsset.bytes, {
      status: 200,
      headers: {
        "Content-Type": product.imageAsset.contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        ETag: `"${product.imageAsset.sha256}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (product.imageSource === "EXTERNAL_URL" && product.imageUrl) {
    try {
      const target = new URL(product.imageUrl);
      if (target.protocol === "https:") return NextResponse.redirect(target, 307);
    } catch {
      // Invalid legacy URL falls through to 404.
    }
  }
  return NextResponse.json({ error: "image_not_found" }, { status: 404 });
}
