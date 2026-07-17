import { type OrderIntent } from "@/lib/ai/schema";

/**
 * Deterministic fallback parser used when NVIDIA NIM is unavailable or its
 * output fails validation twice. Intentionally conservative: it extracts
 * obvious quantities/items and otherwise asks for clarification via
 * missingFields.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const HUMAN_RE =
  /\b(human|agent|talk to (the )?(seller|merchant|person)|speak (to|with)|customer (care|service))\b/i;
const CANCEL_RE = /\b(cancel|forget it|no more|don'?t want)\b/i;
const PAYMENT_RE =
  /\b(paid|payment|transfer(red)?|screenshot|receipt|alert|credited|don pay|i don transfer|check payment)\b/i;
const BUSINESS_RE =
  /\b(open|close|closing|opening|where (are|is) (you|your)|location|address of (the )?(shop|store)|hours)\b/i;
const EDIT_RE = /\bmake (it|am)|change (it|to)|instead of|not \d|actually\b/i;
const SIZES = ["xs", "s", "m", "l", "xl", "xxl", "small", "medium", "large", "extra large"];
const COLOURS = ["black", "white", "navy", "blue", "grey", "gray", "red", "green", "brown"];

function wordToNumber(word: string): number | null {
  const n = Number(word);
  if (Number.isInteger(n) && n > 0) return n;
  return NUMBER_WORDS[word.toLowerCase()] ?? null;
}

export function fallbackExtract(message: string): OrderIntent {
  const text = message.trim();
  const lower = text.toLowerCase();

  const base: OrderIntent = {
    intent: "OTHER",
    items: [],
    deliveryMethod: null,
    deliveryAddress: null,
    deliveryArea: null,
    customerName: null,
    notes: null,
    missingFields: [],
  };

  if (HUMAN_RE.test(lower)) return { ...base, intent: "HUMAN_HELP" };
  if (CANCEL_RE.test(lower)) return { ...base, intent: "CANCEL_ORDER" };
  if (PAYMENT_RE.test(lower)) return { ...base, intent: "PAYMENT_QUESTION" };
  if (BUSINESS_RE.test(lower)) return { ...base, intent: "BUSINESS_QUESTION" };

  // Quantity edit: "make it three, not two"
  const editMatch = lower.match(
    /\bmake (?:it|am) (\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/
  );
  if (editMatch && editMatch[1]) {
    const quantity = wordToNumber(editMatch[1]);
    if (quantity) {
      return {
        ...base,
        intent: "EDIT_ORDER",
        items: [{ searchTerm: "*", quantity, size: null, colour: null }],
      };
    }
  }
  if (EDIT_RE.test(lower) && /\d|one|two|three|four|five/.test(lower)) {
    // Ambiguous edit — surface as EDIT_ORDER with no items so the engine asks.
    return { ...base, intent: "EDIT_ORDER", missingFields: ["items"] };
  }

  // Simple order pattern: "<qty> <words>" segments split by "and"/","/"+"
  const items: OrderIntent["items"] = [];
  const segments = lower
    .replace(/\babeg\b|\bplease\b|\bi (need|want|wan)\b|\bgive me\b|\badd\b/g, "")
    .split(/\band\b|,|\+/);
  for (const segment of segments) {
    const m = segment.match(
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+([a-z][a-z\s-]{2,40})/
    );
    if (!m || !m[1] || !m[2]) continue;
    const quantity = wordToNumber(m[1]);
    if (!quantity) continue;
    let term = m[2].trim();
    let size: string | null = null;
    let colour: string | null = null;
    for (const s of SIZES) {
      const re = new RegExp(`\\b${s}( size)?\\b`);
      if (re.test(segment)) {
        size = s.toUpperCase().startsWith("EXTRA") ? "XL" : s.length <= 3 ? s.toUpperCase() : s;
        term = term.replace(re, "").trim();
      }
    }
    for (const c of COLOURS) {
      if (new RegExp(`\\b${c}\\b`).test(segment)) {
        colour = c;
        term = term.replace(new RegExp(`\\b${c}\\b`), "").trim();
      }
    }
    term = term.replace(/\s{2,}/g, " ").replace(/\b(in|of|for)\b\s*$/, "").trim();
    if (term) items.push({ searchTerm: term, quantity, size, colour });
  }

  // Delivery area: "to Yaba", "deliver to X", "bring am come X"
  const areaMatch = text.match(
    /\b(?:deliver(?:ed|y)? to|send (?:it |them |am )?to|bring (?:am )?(?:come )?|to)\s+([A-Z][A-Za-z\s]{2,40})/
  );
  const deliveryArea = areaMatch?.[1]?.trim() ?? null;
  const pickup = /\bpick\s?up\b|\bi (will|go) come\b/.test(lower);

  if (items.length) {
    return {
      ...base,
      intent: "PLACE_ORDER",
      items,
      deliveryMethod: pickup ? "PICKUP" : deliveryArea ? "DELIVERY" : null,
      deliveryArea,
      missingFields: [
        ...(deliveryArea || pickup ? [] : ["deliveryMethod"]),
        ...items.filter((i) => !i.size).map(() => "size"),
      ].filter((v, i, a) => a.indexOf(v) === i),
    };
  }

  // Bare item mention without a quantity ("I need the black shirt")
  const bareMatch = lower.match(
    /\b(?:i (?:need|want|wan)|the)\s+([a-z][a-z\s-]{2,40})/
  );
  if (bareMatch && bareMatch[1]) {
    let term = bareMatch[1].trim();
    let colour: string | null = null;
    for (const c of COLOURS) {
      if (term.includes(c)) {
        colour = c;
        term = term.replace(c, "").trim();
      }
    }
    if (term) {
      return {
        ...base,
        intent: "PLACE_ORDER",
        items: [{ searchTerm: term, quantity: 1, size: null, colour }],
        missingFields: ["quantity"],
      };
    }
  }

  return base;
}
