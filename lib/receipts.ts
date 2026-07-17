import "server-only";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db";
import { requireEnv, env } from "@/lib/env";
import { generateReceiptToken } from "@/lib/references";
import type { Prisma } from "@prisma/client";

/**
 * Receipts carry a high-entropy random token. We store an HMAC-signed lookup
 * so possession of the URL is the only way to view a receipt — tokens are
 * unguessable and can be revoked.
 */

export function receiptUrl(token: string): string {
  return `${env().APP_URL}/receipt/${token}`;
}

export function receiptVerifyUrl(token: string): string {
  return `${env().APP_URL}/verify/receipt/${token}`;
}

/** Deterministic MAC of the token — defence in depth if the DB leaks. */
export function tokenDigest(token: string): string {
  const { RECEIPT_TOKEN_SECRET } = requireEnv("RECEIPT_TOKEN_SECRET");
  return createHmac("sha256", RECEIPT_TOKEN_SECRET).update(token).digest("hex");
}

/** Creates the order's receipt exactly once; returns the existing one on retry. */
export async function issueReceipt(
  orderId: string,
  tx?: Prisma.TransactionClient
) {
  const db = tx ?? prisma;
  const existing = await db.receipt.findUnique({ where: { orderId } });
  if (existing) return { receipt: existing, created: false };
  const receipt = await db.receipt.create({
    data: { orderId, token: generateReceiptToken() },
  });
  return { receipt, created: true };
}

export async function findReceiptByToken(token: string) {
  if (!token || token.length < 20 || token.length > 100) return null;
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

/** Masks a provider reference for public display: MNFY|12|…9X2V */
export function maskReference(reference: string | null | undefined): string {
  if (!reference) return "—";
  if (reference.length <= 8) return `${reference.slice(0, 2)}…`;
  return `${reference.slice(0, 4)}…${reference.slice(-4)}`;
}
