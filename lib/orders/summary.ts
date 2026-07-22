import { formatNaira } from "@/lib/money";

/**
 * WhatsApp message builders. Uses WhatsApp text styling (*bold*, _italic_)
 * and emoji so replies read like a polished product, not a bot dump.
 */

export interface SummaryLine {
  name: string;
  variant: string | null;
  quantity: number;
  lineTotalKobo: number;
}

export interface SummaryInput {
  lines: SummaryLine[];
  deliveryLabel: string; // e.g. "Delivery to Yaba" or "Pickup (no delivery fee)"
  deliveryFeeKobo: number;
  totalKobo: number;
  deliveryAddress?: string | null;
}

const RULE = "━━━━━━━━━━━━";

/** Builds the WhatsApp order-summary text shown before confirmation. */
export function buildOrderSummaryText(input: SummaryInput): string {
  const parts: string[] = ["🧾 *Here's your order:*", ""];
  for (const line of input.lines) {
    parts.push(`*${line.quantity} × ${line.name}*`);
    if (line.variant) parts.push(`    ${line.variant}`);
    parts.push(`    ${formatNaira(line.lineTotalKobo)}`);
    parts.push("");
  }
  const isPickup = input.deliveryLabel.toLowerCase().startsWith("pickup");
  parts.push(`${isPickup ? "🏬" : "🛵"} ${input.deliveryLabel}`);
  if (!isPickup && input.deliveryAddress) {
    parts.push(`    📍 ${input.deliveryAddress}`);
  }
  parts.push(`    ${formatNaira(input.deliveryFeeKobo)}`);
  parts.push(RULE);
  parts.push(`💰 *TOTAL: ${formatNaira(input.totalKobo)}*`);
  parts.push("");
  parts.push("Everything correct? Tap a button below 👇");
  return parts.join("\n");
}

export function buildPaymentLinkText(
  totalKobo: number,
  reference: string,
  checkoutUrl: string
): string {
  return [
    `✅ Order *${reference}* is confirmed!`,
    "",
    `💰 Total due: *${formatNaira(totalKobo)}*`,
    "",
    "🔐 Pay securely with Monnify:",
    checkoutUrl,
    "",
    "_We verify every payment automatically with Monnify — no screenshots needed. Your receipt lands here the moment it's confirmed._",
  ].join("\n");
}

export function buildReceiptText(receiptUrl: string, reference: string): string {
  return [
    `🎉 *Payment confirmed* for order *${reference}*!`,
    "",
    "🧾 Here's your verifiable receipt — scan its QR code any time:",
    receiptUrl,
    "",
    "Thank you for shopping with us! 💚",
  ].join("\n");
}

export const SCREENSHOT_POLICY_TEXT = [
  "🛡️ Quick heads-up: we don't accept screenshots or payment claims — every payment is verified *directly with Monnify*, automatically.",
  "",
  "Checking your payment status now…",
].join("\n");

export const HELP_TEXT = [
  "👋 *Here's what I can do:*",
  "",
  "🛍️ Send your order in plain words",
  '    _e.g. "2 black polo shirts, large, deliver to Yaba"_',
  "🧾 *menu* — browse the catalogue",
  "🔎 *search <name>* — find a product (or a store)",
  "🛒 *cart* — see your current order",
  "🏬 *stores* — see every store, *START <code>* to switch",
  "💳 *check payment* — live payment status",
  "❌ *cancel* — cancel the current order",
  "🙋 *human* — hand this chat to a person",
].join("\n");
