import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMerchantSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import {
  ProductImageError,
  removeProductImage,
  saveExternalProductImage,
  saveStoredProductImage,
} from "@/lib/product-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ productId: string }> };

const externalSchema = z.object({
  imageUrl: z.string().trim().min(1).max(1000),
});

function errorResponse(error: unknown) {
  if (error instanceof ProductImageError) {
    return NextResponse.json(
      { ok: false, error: error.code, message: error.message },
      { status: error.code === "product_not_found" ? 404 : 400 }
    );
  }
  return NextResponse.json(
    { ok: false, error: "image_upload_failed", message: "Image upload failed." },
    { status: 500 }
  );
}

export async function POST(request: NextRequest, context: Context) {
  const session = await getMerchantSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = rateLimit(`product-image:${session.userId}`, {
    limit: 12,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: limited.retryAfterSeconds },
      { status: 429 }
    );
  }
  const { productId } = await context.params;

  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      const parsed = externalSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: "invalid_url", message: "Enter a valid image URL." },
          { status: 400 }
        );
      }
      const result = await saveExternalProductImage({
        merchantId: session.merchantId,
        productId,
        imageUrl: parsed.data.imageUrl,
      });
      return NextResponse.json({ ok: true, ...result, source: "EXTERNAL_URL" });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "missing_file", message: "Choose an image file." },
        { status: 400 }
      );
    }
    if (file.size > env().PRODUCT_IMAGE_MAX_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: "image_too_large",
          message: `Image must be at most ${Math.floor(
            env().PRODUCT_IMAGE_MAX_BYTES / 1024 / 1024
          )} MB.`,
        },
        { status: 413 }
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await saveStoredProductImage({
      merchantId: session.merchantId,
      productId,
      bytes,
      source: "MERCHANT_UPLOAD",
    });
    return NextResponse.json({
      ok: true,
      ...result,
      source: "MERCHANT_UPLOAD",
      approved: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const session = await getMerchantSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { productId } = await context.params;
  try {
    await removeProductImage({ merchantId: session.merchantId, productId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
