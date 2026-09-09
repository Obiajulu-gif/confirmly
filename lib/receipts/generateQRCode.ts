import QRCode from "qrcode";

/**
 * Generates a high-contrast, scannable QR code PNG buffer.
 * PRD Section 16: Encodes only the verification URL to keep the QR code
 * compact, easily scannable, and performant.
 */
export async function generateQRCode(
  verificationUrl: string,
  size = 175
): Promise<Buffer> {
  return QRCode.toBuffer(verificationUrl, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}
