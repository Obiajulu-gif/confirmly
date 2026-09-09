import fs from "fs";
import path from "path";
import sharp from "sharp";
import { defaultReceiptLayout } from "./receiptLayout";
import { generateQRCode } from "./generateQRCode";
import { generateTextLayer } from "./generateTextLayer";
import type { ReceiptData, ReceiptLayoutConfig } from "./receiptTypes";

// In-memory template buffer cache keyed by template version
const templateCache = new Map<string, Buffer>();

/**
 * Loads and caches the fixed receipt artwork template.
 * PRD Section 6.1 & 23: Supports template versioning (e.g. "v1").
 */
export function getReceiptTemplate(version = "v1"): Buffer {
  if (templateCache.has(version)) {
    return templateCache.get(version)!;
  }

  // Look in public/receipts/ first
  const publicPath = path.join(process.cwd(), "public", "receipts", `confirmly-receipt-${version}.png`);
  if (fs.existsSync(publicPath)) {
    const buf = fs.readFileSync(publicPath);
    templateCache.set(version, buf);
    return buf;
  }

  // Fallback to templates directory
  const rootTemplatePath = path.join(process.cwd(), "templates", "Confirmly Receipt Template.png");
  if (fs.existsSync(rootTemplatePath)) {
    const buf = fs.readFileSync(rootTemplatePath);
    templateCache.set(version, buf);
    return buf;
  }

  throw new Error(`Receipt template version "${version}" not found at ${publicPath}`);
}

/**
 * Generates a complete, high-resolution branded PNG receipt buffer.
 * PRD Section 7, 21:
 * FIXED TEMPLATE + DYNAMIC SVG + QR CODE -> FINAL PNG RECEIPT
 */
export async function generateReceipt(
  receiptData: ReceiptData,
  layout: ReceiptLayoutConfig = defaultReceiptLayout
): Promise<Buffer> {
  const version = receiptData.metadata?.templateVersion || "v1";
  const templateBuffer = getReceiptTemplate(version);

  // 1. Generate QR code for verification URL
  const qrCodeBuffer = await generateQRCode(
    receiptData.verification.verificationUrl,
    layout.qrCode.width
  );

  // 2. Generate transparent SVG text layer
  const textLayerSvgBuffer = generateTextLayer(receiptData, layout);

  // 3. Composite layers using Sharp
  const finalPng = await sharp(templateBuffer)
    .composite([
      {
        input: textLayerSvgBuffer,
        top: 0,
        left: 0,
      },
      {
        input: qrCodeBuffer,
        top: layout.qrCode.top,
        left: layout.qrCode.left,
      },
    ])
    .png({
      compressionLevel: 8,
      adaptiveFiltering: true,
    })
    .toBuffer();

  return finalPng;
}
