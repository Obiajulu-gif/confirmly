import fs from "fs";
import path from "path";
import { parse, type Font, type PathCommand } from "opentype.js";

import { ALONG_SANS_BOLD_BASE64, ALONG_SANS_SEMIBOLD_BASE64 } from "./fontData";

let boldFontCache: Font | null = null;
let semiBoldFontCache: Font | null = null;

function loadFontWithFallback(fileName: string, base64Fallback: string): Font {
  const candidates = [
    path.join(process.cwd(), "font", "along_sans", fileName),
    path.join(process.cwd(), "public", "fonts", fileName),
    path.join(__dirname, "..", "..", "font", "along_sans", fileName),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const buffer = fs.readFileSync(candidate);
        const arrayBuffer = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        );
        return parse(arrayBuffer);
      }
    } catch {
      // Continue to next candidate or fallback
    }
  }

  // Serverless embedded fallback (guarantees fonts load without host filesystem dependencies)
  const buffer = Buffer.from(base64Fallback, "base64");
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  return parse(arrayBuffer);
}

export function getReceiptFonts(): { bold: Font; semiBold: Font } {
  if (!boldFontCache) {
    boldFontCache = loadFontWithFallback("AlongSanss2-Bold.otf", ALONG_SANS_BOLD_BASE64);
  }

  if (!semiBoldFontCache) {
    semiBoldFontCache = loadFontWithFallback("AlongSanss2-SemiBold.otf", ALONG_SANS_SEMIBOLD_BASE64);
  }

  return {
    bold: boldFontCache,
    semiBold: semiBoldFontCache,
  };
}

/**
 * Lays text out glyph by glyph: each glyph's own outline and advance, plus
 * pair kerning when the font provides a finite value.
 */
function layoutGlyphs(font: Font, text: string, fontSize: number) {
  const scale = fontSize / font.unitsPerEm;
  const glyphs = Array.from(text, (ch) => font.charToGlyph(ch));
  const offsets: number[] = [];
  let x = 0;
  glyphs.forEach((glyph, i) => {
    if (i > 0) {
      const kern = font.getKerningValue(glyphs[i - 1]!, glyph);
      if (Number.isFinite(kern)) x += kern * scale;
    }
    offsets.push(x);
    const advance = glyph.advanceWidth ?? 0;
    x += (Number.isFinite(advance) ? advance : 0) * scale;
  });
  return { glyphs, offsets, width: x };
}

/**
 * Serialises path commands to SVG path data. opentype.js's own toPathData()
 * prints "NaN" for coordinates a hair off a whole number (e.g. 641.9999…),
 * and librsvg then silently stops drawing the rest of the path, so letters
 * vanished depending on where they landed. Plain toFixed is always sound.
 */
function pathData(commands: PathCommand[]): string {
  const n = (v: number | undefined) => (Number.isFinite(v) ? (v as number).toFixed(2) : "0");
  let d = "";
  for (const c of commands) {
    if (c.type === "M" || c.type === "L") d += `${c.type}${n(c.x)} ${n(c.y)}`;
    else if (c.type === "Q") d += `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
    else if (c.type === "C") d += `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
    else if (c.type === "Z") d += "Z";
  }
  return d;
}

/** Rendered width of `text`, matching what renderTextPath draws. */
export function measureText(font: Font, text: string, fontSize: number): number {
  return layoutGlyphs(font, text, fontSize).width;
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
  const { glyphs, offsets, width } = layoutGlyphs(font, text, fontSize);
  let startX = x;
  if (anchor === "end") {
    startX = x - width;
  } else if (anchor === "middle") {
    startX = x - width / 2;
  }
  const d = glyphs
    .map((glyph, i) => pathData(glyph.getPath(startX + offsets[i]!, y, fontSize).commands))
    .join("");
  return d ? `<path d="${d}" fill="${fill}"/>` : "";
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
  const singleLineWidth = measureText(font, text, fontSize);

  // 1. Single line fits
  if (singleLineWidth <= maxWidth) {
    return { lines: [text], fontSize };
  }

  // 2. Reduce font size
  while (fontSize > minFontSize) {
    fontSize -= 2;
    if (measureText(font, text, fontSize) <= maxWidth) {
      return { lines: [text], fontSize };
    }
  }

  // 3. Wrap into 2 lines
  fontSize = Math.max(minFontSize, initialFontSize - 6);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (measureText(font, testLine, fontSize) <= maxWidth) {
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
