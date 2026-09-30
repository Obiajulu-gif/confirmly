import "server-only";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { fitTextWithFont, getReceiptFonts, measureText, renderTextPath } from "@/lib/receipts/fonts";

/**
 * "We've joined Confirmly" flyer — one reusable template for every vendor.
 *
 * 1080 × 1350 (4:5), sized for Instagram/WhatsApp Status and fine to print.
 * Carries the Confirmly logo and contact details, the vendor's own logo (or
 * their initials when they haven't uploaded one), the store name, and a QR
 * code that opens WhatsApp straight in their store. Text is drawn as vector
 * paths from the bundled brand font, so it renders identically on any server.
 */

export const FLYER_WIDTH = 1080;
export const FLYER_HEIGHT = 1350;

/** Printed on every flyer, exactly as supplied by the Confirmly team. */
export const CONFIRMLY_CONTACT = {
  website: "confirmliy.com",
  phone: "07044860938",
  email: "confirmlylimited@gmail.com",
} as const;

const BRAND = "#17c19a";
const BRAND_DARK = "#0d8067";
const INK = "#111827";
const NIGHT = "#071019";

export interface StoreFlyerInput {
  storeName: string;
  storeCode: string;
  /** The vendor's uploaded logo bytes, or null to draw their initials. */
  logo: Buffer | null;
  /** wa.me link that opens WhatsApp in this store; null hides the QR. */
  waLink: string | null;
  /** Human-readable WhatsApp number for "send START CODE to …". */
  whatsappNumber: string | null;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

function colourFromName(name: string): string {
  const palette = ["#0f766e", "#7c3aed", "#be123c", "#b45309", "#1d4ed8", "#0369a1", "#15803d", "#c2410c", "#9d174d", "#4338ca"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length]!;
}

function readBrandLogo(): Buffer | null {
  const candidates = [
    path.join(process.cwd(), "public", "brand", "confirmly-logo.png"),
    path.join(__dirname, "..", "..", "public", "brand", "confirmly-logo.png"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate);
    } catch {
      // try the next location
    }
  }
  return null;
}

/** Text centred horizontally, shrunk (then wrapped to 2 lines) to fit. */
function centredText(
  text: string,
  font: ReturnType<typeof getReceiptFonts>["bold"],
  y: number,
  size: number,
  maxWidth: number,
  fill: string,
  minSize = 28,
  lineGap = 1.12
): { svg: string; bottom: number } {
  const fit = fitTextWithFont(font, text, size, maxWidth, minSize);
  const svg = fit.lines
    .map((line, i) => renderTextPath(font, line, FLYER_WIDTH / 2, y + i * fit.fontSize * lineGap, fit.fontSize, "middle", fill))
    .join("");
  return { svg, bottom: y + (fit.lines.length - 1) * fit.fontSize * lineGap };
}

export async function renderStoreFlyer(input: StoreFlyerInput): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const { bold, semiBold } = getReceiptFonts();
  const W = FLYER_WIDTH;
  const H = FLYER_HEIGHT;
  const parts: string[] = [];

  // --- background -----------------------------------------------------------
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  parts.push(`<circle cx="${W - 60}" cy="80" r="360" fill="#e8f9f5"/>`);
  parts.push(`<circle cx="40" cy="${H - 330}" r="260" fill="#f1fbf8"/>`);

  // --- "we're now on Confirmly" pill -----------------------------------------
  const pillText = "WE'RE NOW ON CONFIRMLY";
  const pillSize = 28;
  const pillW = measureText(semiBold, pillText, pillSize) + 72;
  parts.push(`<rect x="${(W - pillW) / 2}" y="208" width="${pillW}" height="60" rx="30" fill="${BRAND}"/>`);
  parts.push(renderTextPath(semiBold, pillText, W / 2, 248, pillSize, "middle", "#ffffff"));

  // --- layout, bottom-up, so a long (two-line) store name never pushes the
  // ordering instructions under the footer; the logo card gives way instead.
  const footerY = H - 150;
  const startLineY = footerY - 44;
  const qr = { size: 240, x: 150, y: startLineY - 58 - 240 };
  const taglineY = qr.y - 52;
  const nameFit = fitTextWithFont(bold, input.storeName, 76, 940, 40);
  const nameGap = nameFit.fontSize * 1.1;
  const nameLastY = taglineY - 70;
  const nameFirstY = nameLastY - (nameFit.lines.length - 1) * nameGap;
  const nameTop = nameFirstY - nameFit.fontSize * 0.78;
  const cardTop = 300;
  const cardSize = Math.round(Math.max(200, Math.min(320, nameTop - 52 - cardTop)));
  const card = { size: cardSize, x: Math.round((W - cardSize) / 2), y: cardTop };
  const inset = Math.round(cardSize * 0.09);

  // --- vendor logo card (image composited later) -------------------------------
  parts.push(`<rect x="${card.x + 6}" y="${card.y + 14}" width="${card.size}" height="${card.size}" rx="56" fill="${INK}" opacity="0.08"/>`);
  parts.push(`<rect x="${card.x}" y="${card.y}" width="${card.size}" height="${card.size}" rx="56" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>`);
  if (!input.logo) {
    const bg = colourFromName(input.storeName);
    parts.push(`<rect x="${card.x + inset}" y="${card.y + inset}" width="${card.size - inset * 2}" height="${card.size - inset * 2}" rx="40" fill="${bg}"/>`);
    const initials = initialsOf(input.storeName);
    const size = Math.round(card.size * (initials.length > 1 ? 0.37 : 0.47));
    parts.push(renderTextPath(bold, initials, W / 2, card.y + card.size / 2 + size * 0.34, size, "middle", "#ffffff"));
  }

  // --- store name + tagline --------------------------------------------------
  nameFit.lines.forEach((line, i) => {
    parts.push(renderTextPath(bold, line, W / 2, nameFirstY + i * nameGap, nameFit.fontSize, "middle", INK));
  });
  parts.push(renderTextPath(semiBold, "Order from us on WhatsApp", W / 2, taglineY, 36, "middle", BRAND_DARK));

  // --- QR / how to order ------------------------------------------------------
  const textX = qr.x + qr.size + 56;
  if (input.waLink) {
    parts.push(`<rect x="${qr.x - 14}" y="${qr.y - 14}" width="${qr.size + 28}" height="${qr.size + 28}" rx="28" fill="#ffffff" stroke="${BRAND}" stroke-width="4"/>`);
    parts.push(renderTextPath(bold, "Scan to order", textX, qr.y + 76, 46, "start", INK));
    parts.push(renderTextPath(semiBold, "Opens our store in WhatsApp:", textX, qr.y + 128, 26, "start", "#4b5563"));
    parts.push(renderTextPath(semiBold, "browse, pay securely and", textX, qr.y + 164, 26, "start", "#4b5563"));
    parts.push(renderTextPath(semiBold, "get a verified receipt.", textX, qr.y + 200, 26, "start", "#4b5563"));
  } else {
    parts.push(renderTextPath(bold, "Order on WhatsApp", W / 2, qr.y + 130, 46, "middle", INK));
  }
  const startLine = input.whatsappNumber
    ? `Or send START ${input.storeCode} to ${input.whatsappNumber}`
    : `Or send START ${input.storeCode} on WhatsApp`;
  parts.push(centredText(startLine, semiBold, startLineY, 30, 900, INK, 22).svg);

  // --- Confirmly footer with contact details ----------------------------------
  parts.push(`<rect x="0" y="${footerY}" width="${W}" height="150" fill="${NIGHT}"/>`);
  parts.push(`<rect x="0" y="${footerY}" width="${W}" height="6" fill="${BRAND}"/>`);
  parts.push(renderTextPath(semiBold, "Payments verified by Confirmly", W / 2, footerY + 58, 26, "middle", "#8ee6cf"));
  const contacts = `${CONFIRMLY_CONTACT.website}   ·   ${CONFIRMLY_CONTACT.phone}   ·   ${CONFIRMLY_CONTACT.email}`;
  parts.push(centredText(contacts, semiBold, footerY + 106, 30, 980, "#ffffff", 20).svg);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;

  // --- raster layers -----------------------------------------------------------
  const layers: Array<{ input: Buffer; top: number; left: number }> = [];

  const brandLogo = readBrandLogo();
  if (brandLogo) {
    const logoW = 400;
    const resized = await sharp(brandLogo).resize({ width: logoW }).png().toBuffer();
    const meta = await sharp(resized).metadata();
    layers.push({ input: resized, left: Math.round((W - logoW) / 2), top: Math.round(128 - (meta.height ?? 120) / 2) });
  } else {
    // Vector fallback if the asset is missing from the bundle.
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="120">${renderTextPath(bold, "Confirmly", W / 2, 90, 76, "middle", INK)}</svg>`
      ),
      left: 0,
      top: 70,
    });
  }

  if (input.logo) {
    const inner = card.size - inset * 2;
    const rounded = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><rect width="${inner}" height="${inner}" rx="36" fill="#fff"/></svg>`
    );
    try {
      const logo = await sharp(input.logo)
        .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .composite([{ input: rounded, blend: "dest-in" }])
        .png()
        .toBuffer();
      layers.push({ input: logo, left: card.x + inset, top: card.y + inset });
    } catch {
      // Unreadable upload: the white card stays; better than failing the flyer.
    }
  }

  if (input.waLink) {
    const qrPng = await QRCode.toBuffer(input.waLink, {
      width: qr.size,
      margin: 0,
      errorCorrectionLevel: "H",
      color: { dark: NIGHT, light: "#ffffff" },
    });
    layers.push({ input: qrPng, left: qr.x, top: qr.y });
  }

  return sharp(Buffer.from(svg)).composite(layers).png({ compressionLevel: 9 }).toBuffer();
}
