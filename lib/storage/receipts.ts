import fs from "fs";
import path from "path";
import { appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface StoredReceipt {
  storagePath: string;
  imageUrl: string;
  fileName: string;
}

/**
 * Storage Subsystem for Receipts
 * PRD Section 22:
 * receipts/
 *   YYYY/
 *     MM/
 *       receipt_<receiptId>.png
 */
export async function storeReceiptImage(
  receiptId: string,
  imageBuffer: Buffer,
  date: Date = new Date()
): Promise<StoredReceipt> {
  const year = date.getUTCFullYear().toString();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const fileName = `receipt_${receiptId}.png`;
  const relativePath = path.join("receipts", "generated", year, month, fileName);

  // 1. Check if Vercel Blob is configured (production serverless)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(relativePath.replace(/\\/g, "/"), imageBuffer, {
        access: "public",
        contentType: "image/png",
      });
      return {
        storagePath: blob.pathname,
        imageUrl: blob.url,
        fileName,
      };
    } catch (err) {
      logger.warn("vercel blob upload failed, falling back to local filesystem", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // 2. Default: Store in public/receipts/generated/YYYY/MM/
  const targetDir = path.join(process.cwd(), "public", "receipts", "generated", year, month);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const fullFilePath = path.join(targetDir, fileName);
  fs.writeFileSync(fullFilePath, imageBuffer);

  const publicUrl = `${appUrl()}/receipts/generated/${year}/${month}/${fileName}`;

  return {
    storagePath: fullFilePath,
    imageUrl: publicUrl,
    fileName,
  };
}

/**
 * Retrieves stored receipt image buffer from local storage or remote URL.
 */
export async function getStoredReceiptImage(
  receiptId: string,
  date: Date = new Date()
): Promise<Buffer | null> {
  const year = date.getUTCFullYear().toString();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const fileName = `receipt_${receiptId}.png`;
  const localPath = path.join(process.cwd(), "public", "receipts", "generated", year, month, fileName);

  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath);
  }

  // Check without date partitioning (direct filename match in generated dir)
  const baseDir = path.join(process.cwd(), "public", "receipts", "generated");
  if (fs.existsSync(baseDir)) {
    const searchFile = (dir: string): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = searchFile(full);
          if (found) return found;
        } else if (entry.name === fileName) {
          return full;
        }
      }
      return null;
    };
    const foundPath = searchFile(baseDir);
    if (foundPath) return fs.readFileSync(foundPath);
  }

  return null;
}
