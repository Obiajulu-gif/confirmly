import { prisma, type TxClient } from "@/lib/db";
import { appUrl } from "@/lib/env";
import type { ReceiptData, ReceiptItem } from "./receiptTypes";

/**
 * Formats currency amount for receipt display.
 * PRD Section 14: formatCurrency(200, "NGN") -> "NGN 200"
 * Accepts amount in kobo (default Confirmly unit: 1 Naira = 100 Kobo).
 */
export function formatCurrency(
  amountKobo: number,
  currency = "NGN",
  style: "code" | "symbol" = "code"
): string {
  const naira = amountKobo / 100;
  const isWhole = Number.isInteger(naira);
  const formattedNumber = naira.toLocaleString("en-NG", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  });

  if (style === "symbol" && (currency === "NGN" || currency === "naira")) {
    return `₦${formattedNumber}`;
  }
  return `${currency.toUpperCase()} ${formattedNumber}`;
}

/**
 * Returns the ordinal suffix for a day of the month (1ST, 2ND, 3RD, 4TH...).
 */
function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "TH";
  switch (day % 10) {
    case 1:
      return "ST";
    case 2:
      return "ND";
    case 3:
      return "RD";
    default:
      return "TH";
  }
}

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEPT",
  "OCT",
  "NOV",
  "DEC",
];

/**
 * Formats transaction timestamp into Confirmly receipt date format.
 * PRD Section 15: "5TH SEPT 2026, 06:57"
 */
export function formatReceiptDate(dateInput?: Date | string | number | null): string {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "—";

  // Display in Africa/Lagos (UTC+1) timezone or local
  const lagosOffsetMs = 60 * 60 * 1000;
  const lagosTime = new Date(date.getTime() + lagosOffsetMs);

  const day = lagosTime.getUTCDate();
  const suffix = getOrdinalSuffix(day);
  const month = MONTH_NAMES[lagosTime.getUTCMonth()];
  const year = lagosTime.getUTCFullYear();
  const hours = String(lagosTime.getUTCHours()).padStart(2, "0");
  const minutes = String(lagosTime.getUTCMinutes()).padStart(2, "0");

  return `${day}${suffix} ${month} ${year}, ${hours}:${minutes}`;
}

export function formatStoreName(name?: string | null): string {
  if (!name || !name.trim()) return "CONFIRMLY STORE";
  return name.trim().toUpperCase();
}

export function formatCustomerName(name?: string | null): string {
  if (!name || !name.trim()) return "WhatsApp Customer";
  return name.trim();
}

export function maskProviderReference(reference?: string | null): string {
  if (!reference) return "—";
  const clean = reference.trim();
  if (clean.length <= 8) return `${clean.slice(0, 4)}…`;
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

/**
 * Builds canonical ReceiptData object from an Order in the database.
 */
export async function buildReceiptDataFromOrder(
  orderIdOrReference: string,
  tx?: TxClient
): Promise<ReceiptData | null> {
  const db = tx ?? prisma;
  const order = await db.order.findFirst({
    where: {
      OR: [{ id: orderIdOrReference }, { reference: orderIdOrReference }],
    },
    include: {
      merchant: true,
      customer: true,
      payment: {
        include: { settlement: true },
      },
      items: true,
      receipt: true,
    },
  });

  if (!order) return null;

  const token = order.receipt?.token ?? order.reference;
  const verificationUrl = `${appUrl()}/verify/receipt/${token}`;

  const items: ReceiptItem[] = order.items.map((it) => ({
    name: it.productNameSnapshot,
    quantity: it.quantity,
    amountKobo: it.lineTotalKobo,
    variant: it.variantSnapshot,
  }));

  const paymentMethod = order.payment?.method?.toUpperCase() || "CARD";
  const settlementStatus =
    order.payment?.settlement?.state === "SETTLED"
      ? "SETTLED"
      : order.payment?.settlement?.state === "FAILED"
        ? "FAILED"
        : "PENDING";

  const rawProviderRef =
    order.payment?.transactionReference ?? order.payment?.paymentReference ?? order.payment?.invoiceReference;

  return {
    transactionId: order.id,
    store: {
      name: order.merchant.name,
      code: order.merchant.storeCode,
      supportEmail: order.merchant.supportEmail || order.merchant.email,
    },
    order: {
      id: order.id,
      reference: order.reference,
      state: order.state,
      deliveryMethod: order.deliveryMethod,
      deliveryZone: order.deliveryZone,
    },
    customer: {
      name: order.customer.name || "WhatsApp Customer",
      phoneNumber: order.customer.phoneNumber,
      waId: order.customer.waId,
    },
    payment: {
      paidAt: order.paidAt || order.createdAt,
      method: paymentMethod,
      providerReference: maskProviderReference(rawProviderRef),
      settlementStatus,
    },
    items,
    totals: {
      subtotalKobo: order.subtotalKobo,
      deliveryFeeKobo: order.deliveryFeeKobo,
      totalPaidKobo: order.totalKobo,
      currency: order.merchant.currency || "NGN",
    },
    verification: {
      receiptId: token,
      verificationUrl,
      revoked: order.receipt?.revokedAt !== null && order.receipt?.revokedAt !== undefined,
    },
    metadata: {
      templateVersion: "v1",
      generatedAt: new Date(),
    },
  };
}
