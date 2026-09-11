import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  issueAndGenerateReceipt,
  findReceiptByIdOrToken,
  getOrGenerateReceiptImage,
  receiptVerifyUrl,
} from "@/lib/receipts";
import { formatCurrency, formatReceiptDate } from "@/lib/receipts/formatReceiptData";

export const dynamic = "force-dynamic";

/**
 * Receipt Generation & Retrieval Route Handler
 * PRD Sections 19, 21, 38.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await context.params;
    if (!transactionId) {
      return NextResponse.json(
        { error: "TRANSACTION_ID_REQUIRED", message: "Transaction ID is required." },
        { status: 400 }
      );
    }

    // Resolve order by transaction ID or reference
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: transactionId }, { reference: transactionId }],
      },
      include: {
        receipt: true,
        merchant: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "TRANSACTION_NOT_FOUND", message: `Order ${transactionId} not found.` },
        { status: 404 }
      );
    }

    // Issue, generate, and store receipt
    const { receipt, created } = await issueAndGenerateReceipt(order.id);

    return NextResponse.json({
      success: true,
      created,
      receipt: {
        id: receipt.id,
        orderId: receipt.orderId,
        orderReference: order.reference,
        token: receipt.token,
        templateVersion: receipt.templateVersion,
        imageUrl: receipt.imageUrl,
        verificationUrl: receiptVerifyUrl(receipt.token),
        status: receipt.status,
        issuedAt: receipt.issuedAt,
        generatedAt: receipt.generatedAt,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "RECEIPT_GENERATION_ERROR",
        message: err instanceof Error ? err.message : "Failed to generate receipt",
      },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await context.params;
    const accept = req.headers.get("accept") || "";
    const wantsImage = accept.includes("image/png") || req.nextUrl.searchParams.get("format") === "png";

    if (wantsImage) {
      const result = await getOrGenerateReceiptImage(transactionId);
      if (!result || !result.imageBuffer || result.imageBuffer.length === 0) {
        return NextResponse.json(
          { error: "RECEIPT_NOT_FOUND", message: "Receipt image could not be generated" },
          { status: 404 }
        );
      }

      return new NextResponse(new Uint8Array(result.imageBuffer), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `inline; filename="receipt_${result.receipt.order.reference}.png"`,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }

    const receipt = await findReceiptByIdOrToken(transactionId);
    if (!receipt) {
      return NextResponse.json(
        { error: "RECEIPT_NOT_FOUND", message: "Receipt not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: receipt.id,
      token: receipt.token,
      orderReference: receipt.order.reference,
      merchant: receipt.order.merchant.name,
      customer: receipt.order.customer.name,
      amountFormatted: formatCurrency(receipt.order.totalKobo, receipt.order.merchant.currency),
      paidAtFormatted: formatReceiptDate(receipt.order.paidAt),
      status: receipt.status,
      revoked: receipt.revokedAt !== null,
      imageUrl: receipt.imageUrl,
      verificationUrl: receiptVerifyUrl(receipt.token),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
