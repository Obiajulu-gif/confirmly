import { describe, expect, it } from "vitest";
import {
  matchAgainst,
  normalize,
  normalizeColour,
  normalizeSize,
  scoreMatch,
  singularize,
  CONFIDENT,
  AMBIGUOUS,
} from "@/lib/orders/matching";

const catalogue = [
  { id: "1", name: "Classic Polo Shirt", aliases: ["polo", "polo shirt", "classic polo"] },
  { id: "2", name: "Premium Hoodie", aliases: ["hoodie", "sweater"] },
  { id: "3", name: "Canvas Tote Bag", aliases: ["tote", "tote bag", "canvas bag"] },
];

const namesOf = (p: (typeof catalogue)[number]) => [p.name, ...p.aliases];

describe("normalization", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalize("  POLO,   Shirt!! ")).toBe("polo shirt");
  });
  it("singularizes plurals", () => {
    expect(singularize("shirts")).toBe("shirt");
    expect(singularize("polos")).toBe("polo");
    expect(singularize("dresses")).toBe("dress");
    expect(singularize("dress")).toBe("dress");
  });
  it("canonicalizes colour spellings", () => {
    expect(normalizeColour("Gray")).toBe("grey");
    expect(normalizeColour("Navy Blue")).toBe("navy");
    expect(normalizeColour(null)).toBeNull();
  });
  it("canonicalizes size labels", () => {
    expect(normalizeSize("large")).toBe("L");
    expect(normalizeSize("Extra Large")).toBe("XL");
    expect(normalizeSize("m")).toBe("M");
    expect(normalizeSize(null)).toBeNull();
  });
});

describe("confidence policy", () => {
  it("selects 'polo' confidently (alias exact match)", () => {
    const result = matchAgainst("polo", catalogue, namesOf);
    expect(result.status).toBe("confident");
    expect(result.best?.item.id).toBe("1");
    expect(result.best?.score).toBeGreaterThanOrEqual(CONFIDENT);
  });

  it("matches plural 'polos' via singularization", () => {
    const result = matchAgainst("polos", catalogue, namesOf);
    expect(result.status).toBe("confident");
    expect(result.best?.item.id).toBe("1");
  });

  it("matches 'black polos' words-contained in catalogue entry", () => {
    const result = matchAgainst("polo shirt", catalogue, namesOf);
    expect(result.best?.item.id).toBe("1");
    expect(result.status).toBe("confident");
  });

  it("returns none for an item the shop does not sell (AI cannot invent it)", () => {
    const result = matchAgainst("meat pie", catalogue, namesOf);
    expect(result.status).toBe("none");
    expect(result.best).toBeNull();
  });

  it("returns none for gibberish", () => {
    expect(matchAgainst("xyzzy plugh", catalogue, namesOf).status).toBe("none");
  });

  it("scores partial overlap in the ambiguous band", () => {
    const score = scoreMatch("canvas polo", "Classic Polo Shirt");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(CONFIDENT);
  });

  it("thresholds are ordered sanely", () => {
    expect(CONFIDENT).toBeGreaterThan(AMBIGUOUS);
  });
});
