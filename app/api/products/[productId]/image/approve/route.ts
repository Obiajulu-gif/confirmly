import { NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/auth";
import {
  approveGeneratedProductImage,
  ProductImageError,
} from "@/lib/product-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ productId: string }> };

export async function POST(_request: Request, context: Context) {
  const session = await getMerchantSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { productId } = await context.params;
  try {
    await approveGeneratedProductImage({
      merchantId: session.merchantId,
      productId,
    });
    return NextResponse.json({ ok: true, approved: true });
  } catch (error) {
    if (error instanceof ProductImageError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "approval_failed" },
      { status: 500 }
    );
  }
}
