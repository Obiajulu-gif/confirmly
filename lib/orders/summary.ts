import { formatNaira } from "@/lib/money";

export interface SummaryLine {
  name: string;
  variant: string | null;
  quantity: number;
  lineTotalKobo: number;
}

export interface SummaryInput {
  lines: SummaryLine[];
  deliveryLabel: string; // e.g. "Delivery to Yaba" or "Pickup"
  deliveryFeeKobo: number;
  totalKobo: number;
}

/** Builds the WhatsApp order-summary text shown before confirmation. */
export function buildOrderSummaryText(input: SummaryInput): string {
  const parts: string[] = ["I found this order:", ""];
  for (const line of input.lines) {
    parts.push(`${line.quantity} × ${line.name}`);
    if (line.variant) parts.push(line.variant);
    parts.push(formatNaira(line.lineTotalKobo));
    parts.push("");
  }
  parts.push(input.deliveryLabel);
  parts.push(formatNaira(input.deliveryFeeKobo));
  parts.push("");
  parts.push("TOTAL");
  parts.push(formatNaira(input.totalKobo));
  return parts.join("\n");
}

export function buildPaymentLinkText(
  totalKobo: number,
  reference: string,
  checkoutUrl: string
): string {
  return [
    `Your order ${reference} is confirmed. ✅`,
    "",
    `Total due: ${formatNaira(totalKobo)}`,
    "",
    "Pay securely with Monnify here:",
    checkoutUrl,
    "",
    "Your order is fulfilled once the payment is confirmed by our payment provider. A screenshot is not required — we verify automatically.",
  ].join("\n");
}

export function buildReceiptText(receiptUrl: string, reference: string): string {
  return [
    `Payment confirmed for order ${reference}. 🎉`,
    "",
    "Here is your verifiable receipt:",
    receiptUrl,
    "",
    "Thank you for shopping with us!",
  ].join("\n");
}

export const SCREENSHOT_POLICY_TEXT =
  "We don't accept screenshots or payment claims as confirmation — payments are verified automatically and securely with Monnify. I'm checking your payment status now…";

export const HELP_TEXT = [
  "Here's what I can do:",
  "• Send me your order in plain words (e.g. \"2 black polo shirts, large, deliver to Yaba\")",
  "• \"check payment\" — I'll check your latest order's payment status",
  "• \"cancel\" — cancel the current order",
  "• \"human\" or \"talk to seller\" — hand this chat to a person",
].join("\n");
