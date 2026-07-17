import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { nairaAmountToKobo } from "@/lib/money";
import {
  authedRequest,
  isFeatureUnavailable,
  MonnifyError,
} from "@/lib/monnify/auth";

/**
 * Settlement tracking. Payment verification and settlement are separate
 * facts: a verified payment creates a PENDING settlement, and only a
 * settlement event (webhook or reconciliation) may mark it SETTLED.
 */

export interface SettlementProbe {
  status: "AVAILABLE" | "UNAVAILABLE" | "ERROR";
  message?: string;
}

/** Best-effort probe of the settlement-detail capability. */
export async function settlementCapabilityProbe(): Promise<SettlementProbe> {
  try {
    await authedRequest("/api/v1/settlement-detail?transactionReference=PROBE");
    return { status: "AVAILABLE" };
  } catch (err) {
    if (err instanceof MonnifyError) {
      // A 4xx "not found for reference" still proves the endpoint exists.
      if (err.status === 400 || /not found|no settlement/i.test(err.message)) {
        return { status: "AVAILABLE" };
      }
      if (isFeatureUnavailable(err)) {
        return {
          status: "UNAVAILABLE",
          message: "Settlement detail API is not enabled for this account.",
        };
      }
      return { status: "ERROR", message: err.message };
    }
    return {
      status: "ERROR",
      message: err instanceof Error ? err.message : "unknown",
    };
  }
}

interface SettlementDetailBody {
  settlementReference?: string;
  amountSettled?: number | string;
  settlementDate?: string;
  destinationAccountNumber?: string;
}

/**
 * Reconciles PENDING settlements by asking Monnify for settlement details of
 * their verified transactions. Fails quietly per-item; never marks SETTLED
 * without provider evidence.
 */
export async function reconcileSettlements(limit = 20): Promise<{
  checked: number;
  settled: number;
  capability: SettlementProbe["status"];
}> {
  const pending = await prisma.settlement.findMany({
    where: { state: "PENDING" },
    include: { payment: true },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
  if (!pending.length) {
    return { checked: 0, settled: 0, capability: "AVAILABLE" };
  }

  let settled = 0;
  let capability: SettlementProbe["status"] = "AVAILABLE";

  for (const settlement of pending) {
    const reference = settlement.payment.transactionReference;
    if (!reference) continue;
    try {
      const data = await authedRequest<SettlementDetailBody>(
        `/api/v1/settlement-detail?transactionReference=${encodeURIComponent(reference)}`
      );
      const body = data.responseBody;
      if (body?.settlementReference) {
        await prisma.settlement.update({
          where: { id: settlement.id },
          data: {
            state: "SETTLED",
            reference: body.settlementReference,
            settledAt: body.settlementDate
              ? new Date(body.settlementDate)
              : new Date(),
            netAmountKobo: body.amountSettled
              ? nairaAmountToKobo(body.amountSettled)
              : settlement.netAmountKobo,
          },
        });
        settled++;
      }
    } catch (err) {
      if (err instanceof MonnifyError && isFeatureUnavailable(err)) {
        capability = "UNAVAILABLE";
        break; // no point probing every row
      }
      logger.warn("settlement reconciliation item failed", {
        settlementId: settlement.id,
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return { checked: pending.length, settled, capability };
}

/**
 * Applies a Monnify settlement-completion webhook event. Marks matching
 * settlements SETTLED by their transaction references.
 */
export async function applySettlementEvent(eventData: {
  settlementReference?: string;
  amountSettled?: number | string;
  settlementTime?: string;
  transactionsReferences?: Array<{ transactionReference?: string }>;
  transactionReference?: string;
}): Promise<number> {
  const references = [
    ...(eventData.transactionsReferences
      ?.map((t) => t.transactionReference)
      .filter((r): r is string => Boolean(r)) ?? []),
    ...(eventData.transactionReference ? [eventData.transactionReference] : []),
  ];
  if (!references.length) return 0;

  let updated = 0;
  for (const reference of references) {
    const payment = await prisma.payment.findUnique({
      where: { transactionReference: reference },
      include: { settlement: true },
    });
    if (!payment?.settlement || payment.settlement.state === "SETTLED") continue;
    await prisma.settlement.update({
      where: { id: payment.settlement.id },
      data: {
        state: "SETTLED",
        reference: eventData.settlementReference ?? payment.settlement.reference,
        settledAt: eventData.settlementTime
          ? new Date(eventData.settlementTime)
          : new Date(),
      },
    });
    const { recordAudit } = await import("@/lib/orders/audit");
    await recordAudit({
      merchantId: payment.settlement.merchantId,
      orderId: payment.orderId,
      event: "Settlement completed",
      actor: "PROVIDER",
      metadata: { reference: eventData.settlementReference },
    });
    updated++;
  }
  return updated;
}
