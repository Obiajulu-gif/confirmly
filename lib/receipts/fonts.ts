import fs from "fs";
import path from "path";
import opentype, { type Font } from "opentype.js";

let boldFontCache: Font | null = null;
let semiBoldFontCache: Font | null = null;

function resolveFontPath(fileName: string): string {
  const candidates = [
    path.join(process.cwd(), "font", "along_sans", fileName),
    path.join(process.cwd(), "public", "fonts", fileName),
    path.join(__dirname, "..", "..", "font", "along_sans", fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(`Font file "${fileName}" not found in candidate paths: ${candidates.join(", ")}`);
}

function loadFontFromPath(filePath: string): Font {
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  return opentype.parse(arrayBuffer);
}

export function getReceiptFonts(): { bold: Font; semiBold: Font } {
  if (!boldFontCache) {
    const boldPath = resolveFontPath("AlongSanss2-Bold.otf");
    boldFontCache = loadFontFromPath(boldPath);
  }

  if (!semiBoldFontCache) {
    const semiBoldPath = resolveFontPath("AlongSanss2-SemiBold.otf");
    semiBoldFontCache = loadFontFromPath(semiBoldPath);
  }

  return {
    bold: boldFontCache,
    semiBold: semiBoldFontCache,
  };
}

/**
 * Converts a text string into an SVG <path> element using the font's actual glyph curves.
 * Guarantees crisp rendering without relying on system fonts or fontconfig.
 */
export function renderTextPath(
  font: Font,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  anchor: "start" | "middle" | "end" = "start",
  fill = "#000000"
): string {
  if (!text || text.trim().length === 0) return "";
  const width = font.getAdvanceWidth(text, fontSize);
  let startX = x;
  if (anchor === "end") {
    startX = x - width;
  } else if (anchor === "middle") {
    startX = x - width / 2;
  }
  const pathObj = font.getPath(text, startX, y, fontSize);
  pathObj.fill = fill;
  return pathObj.toSVG(2);
}

/**
 * Computes exact text width and wraps or shrinks to fit within maxWidth.
 */
export function fitTextWithFont(
  font: Font,
  text: string,
  initialFontSize: number,
  maxWidth: number,
  minFontSize = 24
): { lines: string[]; fontSize: number } {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [""], fontSize: initialFontSize };

  let fontSize = initialFontSize;
  const singleLineWidth = font.getAdvanceWidth(text, fontSize);

  // 1. Single line fits
  if (singleLineWidth <= maxWidth) {
    return { lines: [text], fontSize };
  }

  // 2. Reduce font size
  while (fontSize > minFontSize) {
    fontSize -= 2;
    if (font.getAdvanceWidth(text, fontSize) <= maxWidth) {
      return { lines: [text], fontSize };
    }
  }

  // 3. Wrap into 2 lines
  fontSize = Math.max(minFontSize, initialFontSize - 6);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (font.getAdvanceWidth(testLine, fontSize) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

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
