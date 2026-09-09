import "server-only";
import { createHmac } from "crypto";
import { prisma, type TxClient } from "@/lib/db";
import { requireEnv, appUrl } from "@/lib/env";
import { generateReceiptToken } from "@/lib/references";
import { buildReceiptDataFromOrder } from "@/lib/receipts/formatReceiptData";
import { generateReceipt } from "@/lib/receipts/generateReceipt";
import { storeReceiptImage } from "@/lib/storage/receipts";

/**
 * Receipts carry a high-entropy random token. We store an HMAC-signed lookup
 * so possession of the URL is the only way to view a receipt — tokens are
 * unguessable and can be revoked.
 */

export function receiptUrl(token: string): string {
  return `${appUrl()}/receipt/${token}`;
}

export function receiptVerifyUrl(tokenOrId: string): string {
  return `${appUrl()}/verify/${tokenOrId}`;
}

/** Deterministic MAC of the token — defence in depth if the DB leaks. */
export function tokenDigest(token: string): string {
  const { RECEIPT_TOKEN_SECRET } = requireEnv("RECEIPT_TOKEN_SECRET");
  return createHmac("sha256", RECEIPT_TOKEN_SECRET).update(token).digest("hex");
}

/** Creates the order's receipt exactly once; returns the existing one on retry. */
export async function issueReceipt(orderId: string, tx?: TxClient) {
  const db = tx ?? prisma;
  const existing = await db.receipt.findUnique({ where: { orderId } });
  if (existing) return { receipt: existing, created: false };
  const receipt = await db.receipt.create({
    data: {
      orderId,
      token: generateReceiptToken(),
      templateVersion: "v1",
      status: "GENERATED",
      generatedAt: new Date(),
    },
  });
  return { receipt, created: true };
}

/**
 * Idempotently issues and generates the branded PNG receipt, stores it,
 * and records its image URL. (PRD Section 19, 21, 22, 28)
 */
export async function issueAndGenerateReceipt(orderId: string, tx?: TxClient) {
  const db = tx ?? prisma;
  const { receipt, created } = await issueReceipt(orderId, db);

  // If already has imageUrl, return existing
  if (receipt.imageUrl) {
    return { receipt, created: false };
  }

  // Build normalized receipt data
  const receiptData = await buildReceiptDataFromOrder(orderId, db);
  if (!receiptData) {
    throw new Error(`TRANSACTION_NOT_FOUND: Order ${orderId} could not be resolved for receipt generation.`);
  }

  // Set the immutable verification URL
  receiptData.verification.verificationUrl = receiptVerifyUrl(receipt.token);

  // Generate PNG receipt buffer
  const imageBuffer = await generateReceipt(receiptData);

  // Store receipt image
  const stored = await storeReceiptImage(receipt.id, imageBuffer, receipt.issuedAt);

  // Update receipt record with imageUrl and status
  const updatedReceipt = await db.receipt.update({
    where: { id: receipt.id },
    data: {
      imageUrl: stored.imageUrl,
      status: "GENERATED",
      generatedAt: new Date(),
    },
  });

  return { receipt: updatedReceipt, imageBuffer, created };
}

export async function findReceiptByToken(token: string) {
  if (!token || token.length < 10 || token.length > 100) return null;
  return prisma.receipt.findUnique({
    where: { token },
    include: {
      order: {
        include: {
          items: true,
          merchant: true,
          customer: true,
          payment: { include: { settlement: true } },
        },
      },
    },
  });
}

/**
 * Resolves a receipt by token, receipt ID, or order reference.
 * Used by the verification and receipt display routes.
 */
export async function findReceiptByIdOrToken(identifier: string) {
  if (!identifier || identifier.trim().length === 0) return null;
  const id = identifier.trim();

  // Try token first
  let receipt = await prisma.receipt.findUnique({
    where: { token: id },
    include: {
      order: {
        include: {
          items: true,
          merchant: true,
          customer: true,
          payment: { include: { settlement: true } },
        },
      },
    },
  });

  // Try receipt id
  if (!receipt) {
    receipt = await prisma.receipt.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            items: true,
            merchant: true,
            customer: true,
            payment: { include: { settlement: true } },
          },
        },
      },
    });
  }

  // Try order reference
  if (!receipt) {
    const order = await prisma.order.findUnique({
      where: { reference: id },
      include: { receipt: true },
    });
    if (order?.receipt) {
      return findReceiptByToken(order.receipt.token);
    }
  }

  return receipt;
}

/** Masks a provider reference for public display: MNFY|12|…9X2V */
export function maskReference(reference: string | null | undefined): string {
  if (!reference) return "—";
  if (reference.length <= 8) return `${reference.slice(0, 2)}…`;
  return `${reference.slice(0, 4)}…${reference.slice(-4)}`;
}
