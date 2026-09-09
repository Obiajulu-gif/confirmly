import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendReceiptViaWhatsApp } from "@/lib/whatsapp/sendReceipt";

export const dynamic = "force-dynamic";

/**
 * WhatsApp Receipt Delivery Endpoint
 * PRD Section 24, 38.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = body.orderId || body.transactionId;
    const receiptId = body.receiptId;
    const recipientPhone = body.phone || body.recipientPhone;

    let targetOrderId = orderId;

    if (!targetOrderId && receiptId) {
      const receipt = await prisma.receipt.findFirst({
        where: {
          OR: [{ id: receiptId }, { token: receiptId }],
        },
      });
      if (receipt) {
        targetOrderId = receipt.orderId;
      }
    }

    if (!targetOrderId) {
      return NextResponse.json(
        { error: "ORDER_OR_RECEIPT_REQUIRED", message: "orderId or receiptId is required." },
        { status: 400 }
      );
    }

    const result = await sendReceiptViaWhatsApp({
      orderId: targetOrderId,
      recipientPhone,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "DELIVERY_FAILED", message: "Failed to deliver WhatsApp receipt" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      providerMessageId: result.providerMessageId,
      receiptId: result.receiptId,
      imageUrl: result.imageUrl,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "WHATSAPP_API_ERROR",
        message: err instanceof Error ? err.message : "Failed to process WhatsApp receipt delivery",
      },
      { status: 500 }
    );
  }
}
