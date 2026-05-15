import type { DealStore } from "./store/index.js";
import type { CatalogOverview } from "./types/overview.js";
import { computePriceStats, computeDiscountDistribution } from "./market.js";

/**
 * Build a one-shot catalog overview from the store.
 *
 * Used by the `get_catalog_overview` MCP tool and the `overview` CLI
 * command. Materialises every deal once and reuses the array for the
 * stats computations — fine at the current size (under 1k deals).
 * Beyond ~10k deals this should become a single SQL GROUP BY query.
 */
export function buildCatalogOverview(store: DealStore): CatalogOverview {
  const allDeals = store.listDeals({ limit: 100_000 });
  const categories = store.listCategories();
  const locations = store.listLocations();
  const topMerchants = store.listMerchants({ limit: 5, sort: "dealCount" });
  const totalMerchants = store.countMerchants();

  const priceStats = computePriceStats(allDeals);
  const discountStats = computeDiscountDistribution(allDeals);
  const withDiscountCount = allDeals.filter((d) => d.discountPct !== null).length;

  const scrapedAts = allDeals
    .map((d) => d.scrapedAt)
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .sort();

  return {
    totals: {
      deals: allDeals.length,
      categories: categories.length,
      locations: locations.length,
      merchants: totalMerchants,
    },
    prices: {
      count: priceStats.count,
      minEuros: priceStats.min,
      medianEuros: priceStats.median,
      meanEuros: priceStats.mean,
      maxEuros: priceStats.max,
      stdDevEuros: priceStats.stdDev,
    },
    discounts: {
      withDiscountCount,
      meanPct: discountStats.mean,
      medianPct: discountStats.median,
      buckets: discountStats.buckets,
    },
    topCategories: categories.slice(0, 5),
    topLocations: locations.slice(0, 5),
    topMerchants,
    freshness: {
      earliestScrapedAt: scrapedAts.length ? scrapedAts[0] : null,
      latestScrapedAt: scrapedAts.length ? scrapedAts[scrapedAts.length - 1] : null,
    },
  };
}
