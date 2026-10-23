/*
 * Product search rules. The backend owns these: the frontend's /search page
 * calls GET /api/products/search and renders the result as-is.
 */
import type { Product } from './product';

export const MAX_SEARCH_TERM_LENGTH = 100;

export interface ProductSearchResult {
  products: Product[];
  /** True when at least one word had no exact match and a closest word was used instead. */
  isClosestMatch: boolean;
}

export function normaliseSearchTerm(rawTerm: unknown): string {
  if (typeof rawTerm !== 'string') return '';
  return rawTerm.trim().slice(0, MAX_SEARCH_TERM_LENGTH);
}

/** Words shorter than 3 letters are too ambiguous to correct, so they must match exactly. */
function maxTypoDistance(word: string): number {
  if (word.length < 3) return 0;
  if (word.length < 6) return 1;
  return 2;
}

/** Optimal string alignment distance: insertions, deletions, substitutions and swapped neighbours. */
function editDistance(a: string, b: string): number {
  const cols = b.length + 1;
  const d = new Array<number>((a.length + 1) * cols).fill(0);
  const at = (i: number, j: number): number => d[i * cols + j] ?? 0;

  for (let i = 0; i <= a.length; i++) {
    for (let j = 0; j <= b.length; j++) {
      if (i === 0 || j === 0) {
        d[i * cols + j] = i + j;
        continue;
      }
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let distance = Math.min(
        at(i - 1, j) + 1,
        at(i, j - 1) + 1,
        at(i - 1, j - 1) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        distance = Math.min(distance, at(i - 2, j - 2) + 1);
      }
      d[i * cols + j] = distance;
    }
  }
  return at(a.length, b.length);
}

/** Matching only the start of a word ranks below an equally close whole word. */
const PARTIAL_WORD_PENALTY = 0.5;

/** Compares against the whole token and its start, so partly typed words like "keybo" still match. */
function distanceToToken(word: string, token: string): number {
  let best = editDistance(word, token);
  for (let length = word.length - 1; length <= word.length + 1; length++) {
    if (length > 0 && length < token.length) {
      best = Math.min(
        best,
        editDistance(word, token.slice(0, length)) + PARTIAL_WORD_PENALTY,
      );
    }
  }
  return best;
}

interface SearchCandidate {
  product: Product;
  text: string;
  tokens: string[];
}

function toCandidate(product: Product): SearchCandidate {
  const text = [product.name, ...product.keywords].join(' ').toLowerCase();
  return {
    product,
    text,
    // Whole words keep their hyphens so "noise-canceling" can be corrected to
    // "noise-cancelling"; the parts still match words like "canceling".
    tokens: [
      ...new Set([...text.split(/\s+/), ...text.split(/[^a-z0-9]+/)]),
    ].filter(Boolean),
  };
}

function closestDistance(word: string, candidate: SearchCandidate): number {
  return Math.min(
    ...candidate.tokens.map((token) => distanceToToken(word, token)),
  );
}

/** Total distance of the misspelled words to a product, or undefined if any word is too far off. */
function typoDistance(
  typoWords: readonly string[],
  candidate: SearchCandidate,
): number | undefined {
  let total = 0;
  for (const word of typoWords) {
    const distance = closestDistance(word, candidate);
    if (distance > maxTypoDistance(word) + PARTIAL_WORD_PENALTY) {
      return undefined;
    }
    total += distance;
  }
  return total;
}

/**
 * Every word in the term must match the product name or a keyword. A word that
 * partially matches something in the catalogue is matched exactly; otherwise
 * it is treated as a typo. Exact words are applied first, then only the
 * products closest to all of the misspelled words are kept, so the order of
 * the words does not change the results.
 */
export function findProducts(
  products: readonly Product[],
  searchTerm: string,
): ProductSearchResult {
  const words = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { products: [], isClosestMatch: false };

  const catalogue = products.map(toCandidate);
  const isExactWord = (word: string) =>
    catalogue.some((candidate) => candidate.text.includes(word));
  const exactWords = words.filter(isExactWord);
  const typoWords = words.filter((word) => !isExactWord(word));

  const candidates = catalogue.filter((candidate) =>
    exactWords.every((word) => candidate.text.includes(word)),
  );
  if (typoWords.length === 0) {
    return {
      products: candidates.map((candidate) => candidate.product),
      isClosestMatch: false,
    };
  }

  const scored = candidates.flatMap((candidate) => {
    const distance = typoDistance(typoWords, candidate);
    return distance === undefined ? [] : [{ candidate, distance }];
  });
  const closest = Math.min(...scored.map(({ distance }) => distance));
  const closestProducts = scored
    .filter(({ distance }) => distance === closest)
    .map(({ candidate }) => candidate.product);

  return {
    products: closestProducts,
    isClosestMatch: closestProducts.length > 0,
  };
}

export function searchProducts(
  products: readonly Product[],
  searchTerm: string,
): Product[] {
  return findProducts(products, searchTerm).products;
}
