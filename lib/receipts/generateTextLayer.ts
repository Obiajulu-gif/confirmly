import fs from "fs";
import path from "path";
import { defaultReceiptLayout } from "./receiptLayout";
import { formatCurrency, formatReceiptDate, formatStoreName } from "./formatReceiptData";
import type { ReceiptData, ReceiptLayoutConfig } from "./receiptTypes";

/**
 * Text fitting & wrapping helper.
 * Computes approximate text width and adjusts font size or wraps text if necessary.
 */
function fitText(
  text: string,
  initialFontSize: number,
  maxWidth: number,
  minFontSize = 24
): { lines: string[]; fontSize: number } {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [""], fontSize: initialFontSize };

  // Character width factor for bold / semi-bold UI sans
  const charWidthFactor = 0.58;

  let fontSize = initialFontSize;
  let singleLineWidth = text.length * fontSize * charWidthFactor;

  // 1. If single line fits, return it directly
  if (singleLineWidth <= maxWidth) {
    return { lines: [text], fontSize };
  }

  // 2. Try reducing font size down to minFontSize
  while (fontSize > minFontSize) {
    fontSize -= 2;
    if (text.length * fontSize * charWidthFactor <= maxWidth) {
      return { lines: [text], fontSize };
    }
  }

  // 3. If it still doesn't fit on one line at minFontSize, wrap words into 2 lines
  fontSize = Math.max(minFontSize, initialFontSize - 6);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length * fontSize * charWidthFactor <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  // If word itself is too long for one line, truncate with ellipsis
  return {
    lines: lines.slice(0, 2).map((line, idx) => {
      if (idx === 1 && lines.length > 2) {
        return line + "…";
      }
      return line;
    }),
    fontSize,
  };
}

/**
 * Escapes text for safe embedding in SVG XML.
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates transparent SVG overlay containing all dynamic transaction text.
 * PRD Section 7, 10, 11, 12, 13.
 */
export function generateTextLayer(
  data: ReceiptData,
  layout: ReceiptLayoutConfig = defaultReceiptLayout
): Buffer {
  const { width, height, fields, items: itemsLayout, pickupDelivery } = layout;

  // Format dynamic fields
  const storeNameFormatted = formatStoreName(data.store.name);
  const orderRefFormatted = data.order.reference.toUpperCase();
  const customerNameFormatted = data.customer.name;
  const paidOnFormatted = formatReceiptDate(data.payment.paidAt);
  const paymentMethodFormatted = data.payment.method;
  const providerRefFormatted = data.payment.providerReference;
  const settlementFormatted = data.payment.settlementStatus;
  const totalPaidFormatted = formatCurrency(
    data.totals.totalPaidKobo,
    data.totals.currency || "NGN"
  );

  // Fit Store Name (can wrap to 2 lines if very long)
  const storeFit = fitText(
    storeNameFormatted,
    fields.store.fontSize,
    fields.store.maxWidth || 520,
    28
  );

  // Fit Customer Name
  const customerFit = fitText(
    customerNameFormatted,
    fields.customer.fontSize,
    fields.customer.maxWidth || 450,
    28
  );

  // Build SVG text elements
  const svgParts: string[] = [];

  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <defs>`,
    `    <style>
      .receipt-text {
        font-family: 'Along Sans s2', 'AlongSanss2', 'Along Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        fill: #000000;
        letter-spacing: -0.01em;
      }
      .receipt-bold { font-weight: 700; }
      .receipt-semibold { font-weight: 600; }
    </style>
  </defs>`
  );

  // 1. STORE NAME
  if (storeFit.lines.length === 1) {
    svgParts.push(
      `  <text x="${fields.store.x}" y="${fields.store.y}" text-anchor="end" font-size="${storeFit.fontSize}" class="receipt-text receipt-semibold">${escapeXml(storeFit.lines[0] || "")}</text>`
    );
  } else {
    // 2 lines: adjust Y baseline
    const lineSpacing = storeFit.fontSize + 6;
    const startY = fields.store.y - lineSpacing / 2;
    svgParts.push(
      `  <text x="${fields.store.x}" y="${startY}" text-anchor="end" font-size="${storeFit.fontSize}" class="receipt-text receipt-semibold">${escapeXml(storeFit.lines[0] || "")}</text>`,
      `  <text x="${fields.store.x}" y="${startY + lineSpacing}" text-anchor="end" font-size="${storeFit.fontSize}" class="receipt-text receipt-semibold">${escapeXml(storeFit.lines[1] || "")}</text>`
    );
  }

  // 2. ORDER REFERENCE
  svgParts.push(
    `  <text x="${fields.orderReference.x}" y="${fields.orderReference.y}" text-anchor="end" font-size="${fields.orderReference.fontSize}" class="receipt-text receipt-semibold">${escapeXml(orderRefFormatted)}</text>`
  );

  // 3. CUSTOMER NAME
  if (customerFit.lines.length === 1) {
    svgParts.push(
      `  <text x="${fields.customer.x}" y="${fields.customer.y}" text-anchor="end" font-size="${customerFit.fontSize}" class="receipt-text receipt-semibold">${escapeXml(customerFit.lines[0] || "")}</text>`
    );
  } else {
    const lineSpacing = customerFit.fontSize + 6;
    const startY = fields.customer.y - lineSpacing / 2;
    svgParts.push(
      `  <text x="${fields.customer.x}" y="${startY}" text-anchor="end" font-size="${customerFit.fontSize}" class="receipt-text receipt-semibold">${escapeXml(customerFit.lines[0] || "")}</text>`,
      `  <text x="${fields.customer.x}" y="${startY + lineSpacing}" text-anchor="end" font-size="${customerFit.fontSize}" class="receipt-text receipt-semibold">${escapeXml(customerFit.lines[1] || "")}</text>`
    );
  }

  // 4. PAID ON
  svgParts.push(
    `  <text x="${fields.paidOn.x}" y="${fields.paidOn.y}" text-anchor="end" font-size="${fields.paidOn.fontSize}" class="receipt-text receipt-semibold">${escapeXml(paidOnFormatted)}</text>`
  );

  // 5. PAYMENT METHOD
  svgParts.push(
    `  <text x="${fields.paymentMethod.x}" y="${fields.paymentMethod.y}" text-anchor="end" font-size="${fields.paymentMethod.fontSize}" class="receipt-text receipt-semibold">${escapeXml(paymentMethodFormatted)}</text>`
  );

  // 6. PROVIDER REFERENCE
  svgParts.push(
    `  <text x="${fields.providerReference.x}" y="${fields.providerReference.y}" text-anchor="end" font-size="${fields.providerReference.fontSize}" class="receipt-text receipt-semibold">${escapeXml(providerRefFormatted)}</text>`
  );

  // 7. SETTLEMENT
  svgParts.push(
    `  <text x="${fields.settlement.x}" y="${fields.settlement.y}" text-anchor="end" font-size="${fields.settlement.fontSize}" class="receipt-text receipt-semibold">${escapeXml(settlementFormatted)}</text>`
  );

  // 8. ITEMS SECTION (PRD Section 13)
  const currency = data.totals.currency || "NGN";
  const items = data.items || [];
  const maxRows = itemsLayout.maxVisibleRows || 5;

  let currentY = itemsLayout.startY;
  const lineHeight = itemsLayout.lineHeight;

  if (items.length <= maxRows) {
    for (const item of items) {
      const itemTitle = `${item.quantity} x ${item.name}${item.variant ? ` (${item.variant})` : ""}:`;
      const itemAmount = formatCurrency(item.amountKobo, currency);
      const titleFit = fitText(itemTitle, itemsLayout.fontSize, itemsLayout.maxWidthLeft, 26);

      svgParts.push(
        `  <text x="${itemsLayout.leftX}" y="${currentY}" text-anchor="start" font-size="${titleFit.fontSize}" class="receipt-text receipt-bold">${escapeXml(titleFit.lines[0] || "")}</text>`,
        `  <text x="${itemsLayout.rightX}" y="${currentY}" text-anchor="end" font-size="${itemsLayout.fontSize}" class="receipt-text receipt-semibold">${escapeXml(itemAmount)}</text>`
      );
      currentY += lineHeight;
    }
  } else {
    // Overflow: render first (maxRows - 1) items + "+ N more items"
    const visibleCount = maxRows - 1;
    const remainingCount = items.length - visibleCount;

    for (let i = 0; i < visibleCount; i++) {
      const item = items[i];
      if (!item) continue;
      const itemTitle = `${item.quantity} x ${item.name}${item.variant ? ` (${item.variant})` : ""}:`;
      const itemAmount = formatCurrency(item.amountKobo, currency);
      const titleFit = fitText(itemTitle, itemsLayout.fontSize, itemsLayout.maxWidthLeft, 26);

      svgParts.push(
        `  <text x="${itemsLayout.leftX}" y="${currentY}" text-anchor="start" font-size="${titleFit.fontSize}" class="receipt-text receipt-bold">${escapeXml(titleFit.lines[0] || "")}</text>`,
        `  <text x="${itemsLayout.rightX}" y="${currentY}" text-anchor="end" font-size="${itemsLayout.fontSize}" class="receipt-text receipt-semibold">${escapeXml(itemAmount)}</text>`
      );
      currentY += lineHeight;
    }

    // Overflow row
    svgParts.push(
      `  <text x="${itemsLayout.leftX}" y="${currentY}" text-anchor="start" font-size="${itemsLayout.fontSize}" class="receipt-text receipt-semibold" fill="#5c6b76">+ ${remainingCount} more items</text>`
    );
    currentY += lineHeight;
  }

  // 9. PICKUP / DELIVERY ROW
  const isPickup = data.order.deliveryMethod === "PICKUP" || !data.totals.deliveryFeeKobo;
  const deliveryLabel = isPickup
    ? "Pickup:"
    : `Delivery${data.order.deliveryZone ? ` (${data.order.deliveryZone})` : ""}:`;
  const deliveryAmount = formatCurrency(data.totals.deliveryFeeKobo || 0, currency);

  svgParts.push(
    `  <text x="${pickupDelivery.leftX}" y="${currentY}" text-anchor="start" font-size="${pickupDelivery.fontSize}" class="receipt-text receipt-bold">${escapeXml(deliveryLabel)}</text>`,
    `  <text x="${pickupDelivery.rightX}" y="${currentY}" text-anchor="end" font-size="${pickupDelivery.fontSize}" class="receipt-text receipt-semibold">${escapeXml(deliveryAmount)}</text>`
  );

  // 10. TOTAL PAID
  svgParts.push(
    `  <text x="${fields.totalPaid.x}" y="${fields.totalPaid.y}" text-anchor="end" font-size="${fields.totalPaid.fontSize}" class="receipt-text receipt-bold">${escapeXml(totalPaidFormatted)}</text>`
  );

  svgParts.push(`</svg>`);

  return Buffer.from(svgParts.join("\n"), "utf8");
}
