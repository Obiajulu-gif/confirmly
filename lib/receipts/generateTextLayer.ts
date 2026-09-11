import { defaultReceiptLayout } from "./receiptLayout";
import { formatCurrency, formatReceiptDate, formatStoreName } from "./formatReceiptData";
import { getReceiptFonts, renderTextPath, fitTextWithFont } from "./fonts";
import type { ReceiptData, ReceiptLayoutConfig } from "./receiptTypes";

/**
 * Generates transparent SVG overlay containing all dynamic transaction text
 * converted directly to vector <path> elements using Along Sans s2.
 * PRD Section 7, 10, 11, 12, 13.
 *
 * Vector paths guarantee 100% crisp typography on any OS (including Linux/Vercel)
 * without relying on system fonts or fontconfig.
 */
export function generateTextLayer(
  data: ReceiptData,
  layout: ReceiptLayoutConfig = defaultReceiptLayout
): Buffer {
  const { width, height, fields, items: itemsLayout, pickupDelivery } = layout;
  const fonts = getReceiptFonts();

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
  const storeFit = fitTextWithFont(
    fonts.bold,
    storeNameFormatted,
    fields.store.fontSize,
    fields.store.maxWidth || 520,
    28
  );

  // Fit Customer Name
  const customerFit = fitTextWithFont(
    fonts.semiBold,
    customerNameFormatted,
    fields.customer.fontSize,
    fields.customer.maxWidth || 450,
    28
  );

  // Build SVG path elements
  const paths: string[] = [];

  // 1. STORE NAME
  if (storeFit.lines.length === 1) {
    paths.push(
      renderTextPath(fonts.bold, storeFit.lines[0] || "", fields.store.x, fields.store.y, storeFit.fontSize, "end")
    );
  } else {
    // 2 lines: adjust Y baseline
    const lineSpacing = storeFit.fontSize + 6;
    const startY = fields.store.y - lineSpacing / 2;
    paths.push(
      renderTextPath(fonts.bold, storeFit.lines[0] || "", fields.store.x, startY, storeFit.fontSize, "end"),
      renderTextPath(fonts.bold, storeFit.lines[1] || "", fields.store.x, startY + lineSpacing, storeFit.fontSize, "end")
    );
  }

  // 2. ORDER REFERENCE
  paths.push(
    renderTextPath(fonts.semiBold, orderRefFormatted, fields.orderReference.x, fields.orderReference.y, fields.orderReference.fontSize, "end")
  );

  // 3. CUSTOMER NAME
  if (customerFit.lines.length === 1) {
    paths.push(
      renderTextPath(fonts.semiBold, customerFit.lines[0] || "", fields.customer.x, fields.customer.y, customerFit.fontSize, "end")
    );
  } else {
    const lineSpacing = customerFit.fontSize + 6;
    const startY = fields.customer.y - lineSpacing / 2;
    paths.push(
      renderTextPath(fonts.semiBold, customerFit.lines[0] || "", fields.customer.x, startY, customerFit.fontSize, "end"),
      renderTextPath(fonts.semiBold, customerFit.lines[1] || "", fields.customer.x, startY + lineSpacing, customerFit.fontSize, "end")
    );
  }

  // 4. PAID ON
  paths.push(
    renderTextPath(fonts.semiBold, paidOnFormatted, fields.paidOn.x, fields.paidOn.y, fields.paidOn.fontSize, "end")
  );

  // 5. PAYMENT METHOD
  paths.push(
    renderTextPath(fonts.semiBold, paymentMethodFormatted, fields.paymentMethod.x, fields.paymentMethod.y, fields.paymentMethod.fontSize, "end")
  );

  // 6. PROVIDER REFERENCE
  paths.push(
    renderTextPath(fonts.semiBold, providerRefFormatted, fields.providerReference.x, fields.providerReference.y, fields.providerReference.fontSize, "end")
  );

  // 7. SETTLEMENT
  paths.push(
    renderTextPath(fonts.semiBold, settlementFormatted, fields.settlement.x, fields.settlement.y, fields.settlement.fontSize, "end")
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
      const titleFit = fitTextWithFont(fonts.bold, itemTitle, itemsLayout.fontSize, itemsLayout.maxWidthLeft, 26);

      paths.push(
        renderTextPath(fonts.bold, titleFit.lines[0] || "", itemsLayout.leftX, currentY, titleFit.fontSize, "start"),
        renderTextPath(fonts.semiBold, itemAmount, itemsLayout.rightX, currentY, itemsLayout.fontSize, "end")
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
      const titleFit = fitTextWithFont(fonts.bold, itemTitle, itemsLayout.fontSize, itemsLayout.maxWidthLeft, 26);

      paths.push(
        renderTextPath(fonts.bold, titleFit.lines[0] || "", itemsLayout.leftX, currentY, titleFit.fontSize, "start"),
        renderTextPath(fonts.semiBold, itemAmount, itemsLayout.rightX, currentY, itemsLayout.fontSize, "end")
      );
      currentY += lineHeight;
    }

    // Overflow row
    paths.push(
      renderTextPath(fonts.semiBold, `+ ${remainingCount} more items`, itemsLayout.leftX, currentY, itemsLayout.fontSize, "start", "#5c6b76")
    );
    currentY += lineHeight;
  }

  // 9. PICKUP / DELIVERY ROW
  const isPickup = data.order.deliveryMethod === "PICKUP" || !data.totals.deliveryFeeKobo;
  const deliveryLabel = isPickup
    ? "Pickup:"
    : `Delivery${data.order.deliveryZone ? ` (${data.order.deliveryZone})` : ""}:`;
  const deliveryAmount = formatCurrency(data.totals.deliveryFeeKobo || 0, currency);

  paths.push(
    renderTextPath(fonts.bold, deliveryLabel, pickupDelivery.leftX, currentY, pickupDelivery.fontSize, "start"),
    renderTextPath(fonts.semiBold, deliveryAmount, pickupDelivery.rightX, currentY, pickupDelivery.fontSize, "end")
  );

  // 10. TOTAL PAID
  paths.push(
    renderTextPath(fonts.bold, totalPaidFormatted, fields.totalPaid.x, fields.totalPaid.y, fields.totalPaid.fontSize, "end")
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${paths.filter(Boolean).join("\n")}
</svg>`;

  return Buffer.from(svg, "utf8");
}
