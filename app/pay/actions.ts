"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  sendPaidNotification,
  verifyAndApplyPayment,
} from "@/lib/payments/service";

/**
 * Customer-triggered status refresh on the public pay page. This runs the
 * SAME trusted server-to-server verification the webhook uses — a browser
 * can request a check, it can never assert an outcome.
 */
export async function refreshPaymentStatusAction(
  formData: FormData
): Promise<void> {
  const reference = String(formData.get("reference") ?? "");
  if (!/^CFY-[A-Z0-9-]{4,24}$/i.test(reference)) return;

  const limited = rateLimit(`pay-refresh:${reference}`, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!limited.ok) return;

  const order = await prisma.order.findUnique({
    where: { reference },
    include: { payment: true },
  });
  if (
    order?.payment &&
    order.payment.provider === "MONNIFY" &&
    order.payment.state !== "PAID"
  ) {
    try {
      const result = await verifyAndApplyPayment(order.payment.id);
      await sendPaidNotification(result);
    } catch {
      /* surfaced as unchanged state on the page */
    }
  }
  revalidatePath(`/pay/${reference}`);
}
