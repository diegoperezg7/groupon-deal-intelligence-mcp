import type { DealStore } from "./store/index.js";
import type { CategoryInsights } from "./types/market.js";
import { computePriceStats } from "./market.js";
import { scoreDeal } from "./scoring.js";

/**
 * Aggregate insights for one category across all locations.
 */
export function getCategoryInsights(
  store: DealStore,
  categorySlug: string,
): CategoryInsights {
  const deals = store.listDeals({ categorySlug, limit: 1000 });
  const prices = computePriceStats(deals);

  // Per-location breakdown
  const byLocation = new Map<string, {
    count: number;
    prices: number[];
    discounts: number[];
    ratings: number[];
  }>();
  for (const d of deals) {
    const entry = byLocation.get(d.locationSlug) ?? {
      count: 0,
      prices: [],
      discounts: [],
      ratings: [],
    };
    entry.count += 1;
    if (d.priceCents !== null) entry.prices.push(d.priceCents);
    if (d.discountPct !== null) entry.discounts.push(d.discountPct);
    if (d.rating !== null) entry.ratings.push(d.rating);
    byLocation.set(d.locationSlug, entry);
  }
  const locations = Array.from(byLocation.entries())
    .map(([slug, v]) => ({
      slug,
      dealCount: v.count,
      avgPriceCents: v.prices.length
        ? Math.round(v.prices.reduce((a, b) => a + b, 0) / v.prices.length)
        : null,
      avgDiscountPct: v.discounts.length
        ? Math.round(
            (v.discounts.reduce((a, b) => a + b, 0) / v.discounts.length) * 10,
          ) / 10
        : null,
      avgRating: v.ratings.length
        ? Math.round(
            (v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length) * 100,
          ) / 100
        : null,
    }))
    .sort((a, b) => b.dealCount - a.dealCount);

  const peerMedianCents = (prices.median ?? 0) * 100;
  const topPerformers = deals
    .map((d) => scoreDeal(d, { peerMedianCents }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return {
    category: categorySlug,
    totalDeals: deals.length,
    locations,
    prices,
    topPerformers,
  };
}
