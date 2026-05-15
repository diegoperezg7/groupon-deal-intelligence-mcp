import type { DealStore } from "./store/index.js";
import type { Deal } from "./types/deal.js";
import type {
  CopyPattern,
  DiscountDistribution,
  MarketAnalysis,
  PriceStats,
} from "./types/market.js";
import { scoreDeal } from "./scoring.js";

/**
 * Merchant-side market analysis for a (category, location) pair.
 *
 * Returns:
 * - price statistics (count, min, median, mean, max, stddev)
 * - discount distribution in 5 buckets
 * - top 10 performers ranked by deterministic attractiveness score
 * - underserved sub-segments (heuristic: low listing density)
 * - copy patterns (frequent title tokens with their avg rating/discount)
 *
 * This is the tool a merchant calls to answer "where can I price myself?
 * what does competitive copy look like in this segment?".
 */
export function analyzeMarket(
  store: DealStore,
  options: { categorySlug: string; locationSlug: string },
): MarketAnalysis {
  const deals = store.listDeals({
    categorySlug: options.categorySlug,
    locationSlug: options.locationSlug,
    limit: 500, // gather everything for the segment
  });

  const prices = computePriceStats(deals);
  const discounts = computeDiscountDistribution(deals);
  const peerMedianCents = prices.median ?? 0;
  const scored = deals
    .map((d) => scoreDeal(d, { peerMedianCents: peerMedianCents * 100 }))
    .sort((a, b) => b.score - a.score);
  const topPerformers = scored.slice(0, 10);
  const commonTitleTokens = extractCopyPatterns(deals);
  const underservedSubsegments = detectUnderservedSubsegments(
    store,
    options.categorySlug,
    options.locationSlug,
  );

  return {
    category: options.categorySlug,
    location: options.locationSlug,
    totalDeals: deals.length,
    prices,
    discounts,
    topPerformers,
    underservedSubsegments,
    commonTitleTokens,
    narrative: null, // optional LLM-generated, off by default
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function computePriceStats(deals: Deal[]): PriceStats {
  const prices = deals
    .map((d) => d.priceCents)
    .filter((p): p is number => typeof p === "number")
    .map((c) => c / 100);

  if (prices.length === 0) {
    return { count: 0, min: null, median: null, mean: null, max: null, stdDev: null };
  }
  const sorted = [...prices].sort((a, b) => a - b);
  const sum = prices.reduce((a, b) => a + b, 0);
  const mean = sum / prices.length;
  const variance =
    prices.reduce((acc, p) => acc + (p - mean) ** 2, 0) / prices.length;
  return {
    count: prices.length,
    min: round2(sorted[0]),
    max: round2(sorted[sorted.length - 1]),
    mean: round2(mean),
    median: round2(median(sorted)),
    stdDev: round2(Math.sqrt(variance)),
  };
}

export function computeDiscountDistribution(deals: Deal[]): DiscountDistribution {
  const discounts = deals
    .map((d) => d.discountPct)
    .filter((p): p is number => typeof p === "number");

  const buckets = [
    { range: "0-20%", min: 0, max: 20, count: 0 },
    { range: "20-40%", min: 20, max: 40, count: 0 },
    { range: "40-60%", min: 40, max: 60, count: 0 },
    { range: "60-80%", min: 60, max: 80, count: 0 },
    { range: "80-100%", min: 80, max: 100, count: 0 },
  ];
  for (const d of discounts) {
    for (const b of buckets) {
      if (d >= b.min && d < b.max) {
        b.count += 1;
        break;
      } else if (d === 100 && b.max === 100) {
        b.count += 1;
        break;
      }
    }
  }
  if (discounts.length === 0) {
    return {
      buckets: buckets.map((b) => ({ range: b.range, count: 0 })),
      mean: null,
      median: null,
    };
  }
  const sorted = [...discounts].sort((a, b) => a - b);
  return {
    buckets: buckets.map((b) => ({ range: b.range, count: b.count })),
    mean: round2(discounts.reduce((a, b) => a + b, 0) / discounts.length),
    median: round2(median(sorted)),
  };
}

const STOP_WORDS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "o", "en", "con", "por",
  "para", "un", "una", "unos", "unas", "al", "a", "que", "tu", "su",
  "se", "sin", "más", "muy", "pareja", "personas", "persona",
]);

export function extractCopyPatterns(deals: Deal[]): CopyPattern[] {
  const stats = new Map<string, { count: number; ratings: number[]; discounts: number[] }>();

  for (const d of deals) {
    const tokens = tokenise(d.title);
    for (const t of new Set(tokens)) {
      const entry = stats.get(t) ?? { count: 0, ratings: [], discounts: [] };
      entry.count += 1;
      if (d.rating !== null) entry.ratings.push(d.rating);
      if (d.discountPct !== null) entry.discounts.push(d.discountPct);
      stats.set(t, entry);
    }
  }

  const total = deals.length;
  const minOccurrences = Math.max(2, Math.floor(total * 0.1));

  return Array.from(stats.entries())
    .filter(([, v]) => v.count >= minOccurrences)
    .map(([token, v]) => ({
      token,
      occurrences: v.count,
      avgRating: v.ratings.length
        ? round2(v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length)
        : null,
      avgDiscountPct: v.discounts.length
        ? round2(v.discounts.reduce((a, b) => a + b, 0) / v.discounts.length)
        : null,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 20);
}

function tokenise(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-záéíóúñü0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * Heuristic gap detector: in the same category but DIFFERENT locations,
 * which locations have notably fewer deals than this one? Those are
 * "underserved markets" relative to this category — a merchant
 * opportunity signal.
 */
export function detectUnderservedSubsegments(
  store: DealStore,
  categorySlug: string,
  thisLocation: string,
): string[] {
  const refCount = store.countDeals({ categorySlug, locationSlug: thisLocation });
  if (refCount === 0) return [];
  const locations = store.listLocations();
  const peer = locations
    .filter((l) => l.slug !== thisLocation && l.dealCount > 0)
    .map((l) => ({
      slug: l.slug,
      catCount: store.countDeals({
        categorySlug,
        locationSlug: l.slug,
      }),
    }));

  // "Underserved": a location that has many deals overall but few in this
  // category — implies the category isn't being served there at scale.
  return peer
    .filter((p) => p.catCount > 0 && p.catCount < refCount * 0.4)
    .map((p) => p.slug)
    .slice(0, 5);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function median(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sortedAsc[mid - 1] + sortedAsc[mid]) / 2 : sortedAsc[mid];
}
