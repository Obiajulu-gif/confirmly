import { describe, expect, it } from "vitest";
import { getReceiptFonts, measureText, renderTextPath } from "@/lib/receipts/fonts";

/**
 * opentype.js's own path formatter prints "NaN" for coordinates a hair off a
 * whole number, and librsvg then drops the rest of the text. These strings
 * and positions reproduced missing letters on flyers and receipts.
 */
describe("renderTextPath", () => {
  const { bold, semiBold } = getReceiptFonts();
  const cases = [
    "Mama Nkechi's Premium",
    "confirmliy.com · 07044860938 · confirmlylimited@gmail.com",
    "Office fifty fluffy",
    "Opens our store in WhatsApp —",
  ];

  it("never emits NaN, at any position or size", () => {
    for (const font of [bold, semiBold]) {
      for (const text of cases) {
        for (let x = 0; x < 1080; x += 7.13) {
          for (const size of [24, 30, 60, 70, 76]) {
            const svg = renderTextPath(font, text, x, 100, size, "middle");
            expect(svg, `${text} @ x=${x} size=${size}`).not.toMatch(/NaN|Infinity/);
          }
        }
      }
    }
  });

  it("draws every non-space character", () => {
    const text = "confirmliy.com";
    const svg = renderTextPath(semiBold, text, 540, 100, 30, "middle");
    const subpaths = (svg.match(/M/g) ?? []).length;
    // Each glyph contributes at least one subpath ("i" and "m" etc. more).
    expect(subpaths).toBeGreaterThanOrEqual(text.length);
  });

  it("anchors by the same width it measures", () => {
    const width = measureText(bold, "Ada Styles", 60);
    expect(width).toBeGreaterThan(0);
    const start = renderTextPath(bold, "Ada Styles", 100, 100, 60, "start");
    const end = renderTextPath(bold, "Ada Styles", 100 + width, 100, 60, "end");
    expect(end).toBe(start);
  });

  it("returns nothing for blank text", () => {
    expect(renderTextPath(bold, "   ", 0, 0, 30)).toBe("");
  });
});
