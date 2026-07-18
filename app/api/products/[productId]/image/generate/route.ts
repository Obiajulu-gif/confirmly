import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMerchantSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  generateProductImage,
  ProductImageGenerationError,
} from "@/lib/ai/product-image-generator";
import { saveStoredProductImage } from "@/lib/product-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Context = { params: Promise<{ productId: string }> };

const bodySchema = z.object({
  customPrompt: z.string().trim().max(1800).optional().nullable(),
  force: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest, context: Context) {
  const session = await getMerchantSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { productId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_prompt", message: "The image prompt is invalid." },
      { status: 400 }
    );
  }

  const productLimit = rateLimit(`image-generation:product:${productId}`, {
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  const merchantLimit = rateLimit(
    `image-generation:merchant:${session.merchantId}`,
    { limit: 20, windowMs: 24 * 60 * 60 * 1000 }
  );
  if (!productLimit.ok || !merchantLimit.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        message: "Image generation limit reached. Try again later.",
      },
      { status: 429 }
    );
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, merchantId: session.merchantId },
    include: { variants: true, imageAsset: true },
  });
  if (!product) {
    return NextResponse.json({ error: "product_not_found" }, { status: 404 });
  }
  if (product.imageStatus === "PROCESSING") {
    return NextResponse.json(
      { ok: false, error: "already_processing" },
      { status: 409 }
    );
  }
  if (
    product.imageSource === "AI_GENERATED" &&
    product.imageApprovedAt &&
    !parsed.data.force
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "approved_image_exists",
        message: "Use regenerate to replace the approved illustration.",
      },
      { status: 409 }
    );
  }

  await prisma.product.update({
    where: { id: product.id },
    data: {
      imageStatus: "PROCESSING",
      imageFailureReason: null,
    },
  });

  try {
    const generated = await generateProductImage({
      name: product.name,
      category: product.category,
      description: product.description,
      colours: [
        ...new Set(
          product.variants
            .map((variant) => variant.colour)
            .filter((value): value is string => Boolean(value))
        ),
      ],
      sizes: [
        ...new Set(
          product.variants
            .map((variant) => variant.size)
            .filter((value): value is string => Boolean(value))
        ),
      ],
      customPrompt: parsed.data.customPrompt,
    });
    const result = await saveStoredProductImage({
      merchantId: session.merchantId,
      productId: product.id,
      bytes: generated.bytes,
      source: "AI_GENERATED",
      prompt: generated.prompt,
    });
    return NextResponse.json({
      ok: true,
      status: "READY",
      imageUrl: result.imageUrl,
      source: "AI_GENERATED",
      approved: false,
      message: "Image generated. Review and approve it before customers see it.",
    });
  } catch (error) {
    const code =
      error instanceof ProductImageGenerationError
        ? error.code
        : "provider_unavailable";
    const message =
      error instanceof Error ? error.message : "Image generation failed.";
    await prisma.product.updateMany({
      where: { id: product.id, merchantId: session.merchantId },
      data: {
        imageStatus: "FAILED",
        imageFailureReason: message.slice(0, 300),
      },
    });
    const status =
      code === "permission_denied"
        ? 403
        : code === "credits_exhausted"
          ? 402
          : code === "rate_limited"
            ? 429
            : code === "invalid_prompt"
              ? 422
              : code === "disabled" || code === "missing_key"
                ? 503
                : 502;
    return NextResponse.json(
      { ok: false, error: code, message },
      { status }
    );
  }
}
