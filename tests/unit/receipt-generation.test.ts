import { describe, it, expect } from "vitest";
import fs from "fs";
import sharp from "sharp";
import {
  formatCurrency,
  formatReceiptDate,
  formatCustomerName,
  formatStoreName,
  maskProviderReference,
} from "@/lib/receipts/formatReceiptData";
import { generateQRCode } from "@/lib/receipts/generateQRCode";
import { generateTextLayer } from "@/lib/receipts/generateTextLayer";
import { generateReceipt } from "@/lib/receipts/generateReceipt";
import type { ReceiptData } from "@/lib/receipts/receiptTypes";

describe("Receipt Formatting Functions (PRD Section 14, 15, 36)", () => {
  it("formats currency correctly in NGN and symbol", () => {
    // 20000 kobo = 200 Naira
    expect(formatCurrency(20000, "NGN")).toBe("NGN 200");
    expect(formatCurrency(20000, "NGN", "symbol")).toBe("₦200");

    // 1000000 kobo = 10,000 Naira
    expect(formatCurrency(1000000, "NGN")).toBe("NGN 10,000");

    // With kobo decimals
    expect(formatCurrency(25050, "NGN")).toBe("NGN 250.50");

    // Zero amount
    expect(formatCurrency(0, "NGN")).toBe("NGN 0");
  });

  it("formats canonical receipt date matching PRD format (5TH SEPT 2026, 06:57)", () => {
    // Note: formatReceiptDate displays in UTC+1 (Lagos time)
    const date = new Date("2026-09-05T05:57:00Z"); // 05:57 UTC = 06:57 Lagos
    const formatted = formatReceiptDate(date);
    expect(formatted).toBe("5TH SEPT 2026, 06:57");

    // Ordinal suffixes
    expect(formatReceiptDate(new Date("2026-01-01T12:00:00Z"))).toContain("1ST JAN 2026");
    expect(formatReceiptDate(new Date("2026-02-02T12:00:00Z"))).toContain("2ND FEB 2026");
    expect(formatReceiptDate(new Date("2026-03-03T12:00:00Z"))).toContain("3RD MAR 2026");
    expect(formatReceiptDate(new Date("2026-04-04T12:00:00Z"))).toContain("4TH APR 2026");
  });

  it("formats store and customer names", () => {
    expect(formatStoreName("ai robotics innovation technologies")).toBe(
      "AI ROBOTICS INNOVATION TECHNOLOGIES"
    );
    expect(formatCustomerName("  Emmanuel Okoye  ")).toBe("Emmanuel Okoye");
    expect(formatCustomerName(null)).toBe("WhatsApp Customer");
  });

  it("masks provider reference safely", () => {
    expect(maskProviderReference("MNFY123456780218")).toBe("MNFY...0218");
    expect(maskProviderReference("SHORT")).toBe("SHOR…");
    expect(maskProviderReference(null)).toBe("—");
  });
});

describe("QR Code Generation (PRD Section 16, 36)", () => {
  it("generates a valid 175x175 PNG buffer for verification URL", async () => {
    const url = "https://confirmly.com/verify/CFY-C9BM9UDM";
    const qrBuffer = await generateQRCode(url, 175);
    expect(Buffer.isBuffer(qrBuffer)).toBe(true);

    const metadata = await sharp(qrBuffer).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(175);
    expect(metadata.height).toBe(175);
  });
});

describe("Dynamic SVG Text Layer (PRD Section 7, 12, 13)", () => {
  const baseData: ReceiptData = {
    transactionId: "tx_test_1",
    store: { name: "AI ROBOTICS INNOVATION TECHNOLOGIES" },
    order: {
      id: "ord_1",
      reference: "CFY-C9BM9UDM",
      state: "PAID",
      deliveryMethod: "PICKUP",
    },
    customer: { name: "Emmanuel Okoye" },
    payment: {
      paidAt: "2026-09-05T05:57:00Z",
      method: "CARD",
      providerReference: "MNFY...0218",
      settlementStatus: "PENDING",
    },
    items: [
      { name: "Arduino Kit", quantity: 1, amountKobo: 20000 },
    ],
    totals: {
      subtotalKobo: 20000,
      deliveryFeeKobo: 0,
      totalPaidKobo: 20000,
      currency: "NGN",
    },
    verification: {
      receiptId: "CFY-C9BM9UDM",
      verificationUrl: "https://confirmly.com/verify/CFY-C9BM9UDM",
    },
  };

  it("produces valid SVG containing vector paths for all dynamic fields", () => {
    const svgBuffer = generateTextLayer(baseData);
    const svgString = svgBuffer.toString("utf8");

    expect(svgString).toContain("<svg");
    expect(svgString).toContain("</svg>");
    expect(svgString).toContain("<path d=");
    // Should contain multiple vector path elements for text fields
    const pathMatches = svgString.match(/<path d=/g);
    expect(pathMatches).not.toBeNull();
    expect(pathMatches!.length).toBeGreaterThanOrEqual(10);
  });

  it("handles overflow gracefully when items exceed maximum (PRD Section 13)", () => {
    const multiItemData: ReceiptData = {
      ...baseData,
      items: [
        { name: "Product A", quantity: 1, amountKobo: 100000 },
        { name: "Product B", quantity: 2, amountKobo: 50000 },
        { name: "Product C", quantity: 1, amountKobo: 30000 },
        { name: "Product D", quantity: 3, amountKobo: 75000 },
        { name: "Product E", quantity: 1, amountKobo: 20000 },
        { name: "Product F", quantity: 4, amountKobo: 40000 },
        { name: "Product G", quantity: 1, amountKobo: 15000 },
      ],
    };

    const svgString = generateTextLayer(multiItemData).toString("utf8");
    expect(svgString).toContain("<svg");
    expect(svgString).toContain("</svg>");
    // Should render visible items plus the overflow path
    const pathMatches = svgString.match(/<path d=/g);
    expect(pathMatches).not.toBeNull();
    expect(pathMatches!.length).toBeGreaterThan(12);
  });

  it("handles delivery with zones", () => {
    const deliveryData: ReceiptData = {
      ...baseData,
      order: {
        ...baseData.order,
        deliveryMethod: "DELIVERY",
        deliveryZone: "Lekki Phase 1",
      },
      totals: {
        ...baseData.totals,
        deliveryFeeKobo: 150000,
        totalPaidKobo: 170000,
      },
    };

    const svgString = generateTextLayer(deliveryData).toString("utf8");
    expect(svgString).toContain("<svg");
    expect(svgString).toContain("</svg>");
    expect(svgString).toContain("<path d=");
  });
});

describe("Complete Receipt Generation with Sharp (PRD Section 21, 35)", () => {
  it("composites base template, dynamic text, and QR code into a 1024x1536 PNG", async () => {
    const receiptData: ReceiptData = {
      transactionId: "ord_complete_1",
      store: { name: "TECHNOVA ELECTRONICS HUB" },
      order: {
        id: "ord_complete_1",
        reference: "CFY-99AB88CD",
        state: "PAID",
        deliveryMethod: "DELIVERY",
        deliveryZone: "Victoria Island",
      },
      customer: { name: "Dr. Chioma Nnamdi" },
      payment: {
        paidAt: new Date("2026-08-15T14:30:00Z"),
        method: "BANK_TRANSFER",
        providerReference: "MNFY...9876",
        settlementStatus: "SETTLED",
      },
      items: [
        { name: "Raspberry Pi 5", quantity: 2, amountKobo: 1800000 },
        { name: "MicroSD Card 128GB", quantity: 2, amountKobo: 300000 },
      ],
      totals: {
        subtotalKobo: 2100000,
        deliveryFeeKobo: 200000,
        totalPaidKobo: 2300000,
        currency: "NGN",
      },
      verification: {
        receiptId: "CFY-99AB88CD",
        verificationUrl: "https://confirmly.com/verify/CFY-99AB88CD",
      },
    };

    const pngBuffer = await generateReceipt(receiptData);
    expect(Buffer.isBuffer(pngBuffer)).toBe(true);

    const artifactPath = "C:/Users/U S E R/.gemini/antigravity/brain/f3d827d7-46ba-4b70-b5cb-d74ae3450575/sample_receipt.png";
    fs.writeFileSync(artifactPath, pngBuffer);

    const imageInfo = await sharp(pngBuffer).metadata();
    expect(imageInfo.format).toBe("png");
    expect(imageInfo.width).toBe(1024);
    expect(imageInfo.height).toBe(1536);
    expect(imageInfo.hasAlpha).toBe(true);
  });
});
