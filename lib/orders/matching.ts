/**
 * Catalogue matching: normalization + scoring + the confidence policy.
 *
 *   >= 0.85      select provisionally and show for confirmation
 *   0.60 – 0.84  show two or three alternatives
 *   <  0.60      ask the customer to describe the item again
 */

export const CONFIDENT = 0.85;
export const AMBIGUOUS = 0.6;

const COLOUR_SPELLINGS: Record<string, string> = {
  gray: "grey",
  navyblue: "navy",
  "navy blue": "navy",
};

const SIZE_LABELS: Record<string, string> = {
  small: "S",
  medium: "M",
  large: "L",
  "extra large": "XL",
  "extra-large": "XL",
  xl: "XL",
  xxl: "XXL",
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Very light singularization: shirts→shirt, dresses→dress, totes→tote. */
export function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("es") && /(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function normalizeColour(colour: string | null): string | null {
  if (!colour) return null;
  const n = normalize(colour);
  return COLOUR_SPELLINGS[n] ?? n;
}

export function normalizeSize(size: string | null): string | null {
  if (!size) return null;
  const n = normalize(size).replace(/\bsize\b/g, "").trim();
  return SIZE_LABELS[n] ?? n.toUpperCase();
}

function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean).map(singularize);
}

/** Dice coefficient over singularized token sets, with containment bonuses. */
export function scoreMatch(searchTerm: string, candidate: string): number {
  const a = tokens(searchTerm);
  const b = tokens(candidate);
  if (!a.length || !b.length) return 0;

  const aJoined = a.join(" ");
  const bJoined = b.join(" ");
  if (aJoined === bJoined) return 1;

  const setB = new Set(b);
  const overlap = a.filter((t) => setB.has(t)).length;

  // Every search token appears in the candidate (e.g. "polo" ⊆ "classic polo shirt")
  if (overlap === a.length) return 0.9;
  // Candidate fully contained in the search term
  if (overlap === b.length) return 0.88;

  return (2 * overlap) / (a.length + b.length);
}

/**
 * Search ranking for the WhatsApp store/product finders: token-overlap
 * (scoreMatch) plus a substring-containment boost so a fragment query
 * ("ada" → "Ada Styles", "polo" → "Classic Polo Shirt") still surfaces.
 */
export function searchScore(query: string, candidate: string): number {
  if (!candidate) return 0;
  const base = scoreMatch(query, candidate);
  const nq = normalize(query);
  const nc = normalize(candidate);
  if (nq && nc.includes(nq)) return Math.max(base, 0.8);
  return base;
}

export interface MatchCandidate<T> {
  item: T;
  score: number;
}

export interface MatchResult<T> {
  status: "confident" | "ambiguous" | "none";
  best: MatchCandidate<T> | null;
  alternatives: MatchCandidate<T>[];
}

/**
 * Matches a customer search term against catalogue entries. `namesOf` must
 * return the display name plus aliases for each item.
 */
export function matchAgainst<T>(
  searchTerm: string,
  items: T[],
  namesOf: (item: T) => string[]
): MatchResult<T> {
  const scored: MatchCandidate<T>[] = items
    .map((item) => ({
      item,
      score: Math.max(0, ...namesOf(item).map((n) => scoreMatch(searchTerm, n))),
    }))
    .sort((x, y) => y.score - x.score);

  const best = scored[0];
  if (!best || best.score < AMBIGUOUS) {
    return { status: "none", best: null, alternatives: [] };
  }
  if (best.score >= CONFIDENT) {
    // A near-tie with a different product still needs disambiguation.
    const runnerUp = scored[1];
    if (runnerUp && runnerUp.score >= CONFIDENT && runnerUp.score === best.score) {
      return {
        status: "ambiguous",
        best,
        alternatives: scored.slice(0, 3).filter((c) => c.score >= AMBIGUOUS),
      };
    }
    return { status: "confident", best, alternatives: [] };
  }
  return {
    status: "ambiguous",
    best,
    alternatives: scored.slice(0, 3).filter((c) => c.score >= AMBIGUOUS),
  };
}
