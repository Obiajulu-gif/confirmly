import "server-only";
import { prisma } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { logger } from "@/lib/logger";
import { randomCode } from "@/lib/references";
import { formatCurrency } from "@/lib/receipts/formatReceiptData";
import { issueAndGenerateReceipt, receiptUrl } from "@/lib/receipts";
import { sendText, sendImageByUrl } from "@/lib/whatsapp/client";

export interface SendReceiptInput {
  orderId: string;
  recipientPhone?: string;
  forceRegenerate?: boolean;
}

export interface SendReceiptResult {
  success: boolean;
  providerMessageId?: string;
  receiptId: string;
  imageUrl?: string | null;
  error?: string;
}

/**
 * Builds the concise WhatsApp message text matching PRD Section 25.
 */
export function buildReceiptWhatsAppMessage(input: {
  customerName: string;
  storeName: string;
  reference: string;
  amountKobo: number;
  currency?: string;
}): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || "there";
  const formattedAmount = formatCurrency(input.amountKobo, input.currency || "NGN");

  return [
    `Hi ${firstName} 👋`,
    "",
    `Your payment receipt from ${input.storeName} is ready.`,
    "",
    `Order Reference: ${input.reference}`,
    `Amount: ${formattedAmount}`,
    "",
    "Your official Confirmly digital receipt is attached below.",
  ].join("\n");
}

/**
 * Delivers the branded digital receipt via WhatsApp API.
 * PRD Section 24, 25, 26:
 * - Isolated from receipt generator
 * - Concise text notification + branded receipt PNG image
 * - Failure is handled gracefully and independently of transaction success
 */
export async function sendReceiptViaWhatsApp(
  input: SendReceiptInput
): Promise<SendReceiptResult> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      customer: true,
      merchant: true,
      receipt: true,
    },
  });

  if (!order) {
    return { success: false, receiptId: "", error: "ORDER_NOT_FOUND" };
  }

  // 1. Ensure receipt is generated and stored
  const { receipt } = await issueAndGenerateReceipt(order.id);

  // 2. Determine destination phone number
  const to = (input.recipientPhone || order.customer.waId || order.customer.phoneNumber || "").replace(/\D/g, "");
  if (!to || to.length < 7) {
    logger.warn("cannot send WhatsApp receipt: missing customer phone number", {
      orderId: order.id,
    });
    return {
      success: false,
      receiptId: receipt.id,
      imageUrl: receipt.imageUrl,
      error: "INVALID_PHONE_NUMBER",
    };
  }

  const messageText = buildReceiptWhatsAppMessage({
    customerName: order.customer.name || "Customer",
    storeName: order.merchant.name,
    reference: order.reference,
    amountKobo: order.totalKobo,
    currency: order.merchant.currency,
  });

  let providerMessageId: string;

  try {
    if (isDemoMode()) {
      providerMessageId = `demo-${randomCode(12)}`;
      logger.info("demo mode: WhatsApp receipt marked sent", {
        orderId: order.id,
        receiptId: receipt.id,
      });
    } else {
      // If imageUrl is public HTTPS, send image with caption
      const isPublicHttps = receipt.imageUrl && /^https:\/\//i.test(receipt.imageUrl);

      if (isPublicHttps) {
        try {
          const sendResult = await sendImageByUrl(to, {
            imageUrl: receipt.imageUrl!,
            caption: messageText,
          });
          providerMessageId = sendResult.providerMessageId;
        } catch (imageErr) {
          logger.warn("WhatsApp image delivery failed, falling back to text with receipt link", {
            orderId: order.id,
            error: imageErr instanceof Error ? imageErr.message : "unknown",
          });
          const textWithLink = `${messageText}\n\nView official receipt: ${receiptUrl(receipt.token)}`;
          const fallbackResult = await sendText(to, textWithLink);
          providerMessageId = fallbackResult.providerMessageId;
        }
      } else {
        // Fallback for non-public HTTPS (e.g. dev/staging): send message text with receipt link
        const textWithLink = `${messageText}\n\nView official receipt: ${receiptUrl(receipt.token)}`;
        const sendResult = await sendText(to, textWithLink);
        providerMessageId = sendResult.providerMessageId;
      }
    }

    // Update receipt status
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    return {
      success: true,
      providerMessageId,
      receiptId: receipt.id,
      imageUrl: receipt.imageUrl,
    };
  } catch (err) {
    logger.error("failed to deliver WhatsApp receipt", {
      orderId: order.id,
      receiptId: receipt.id,
      error: err instanceof Error ? err.message : "unknown",
    });

    return {
      success: false,
      receiptId: receipt.id,
      imageUrl: receipt.imageUrl,
      error: err instanceof Error ? err.message : "WHATSAPP_DELIVERY_ERROR",
    };
  }
}
