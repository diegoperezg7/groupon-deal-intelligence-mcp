import { z } from "zod";

/**
 * Catalog overview — a single-call orientation snapshot at the start
 * of an MCP session, or for humans asking "what's in here?".
 *
 * Wire shape uses euros (not cents). Designed to be cheap to compute
 * for catalogues of a few thousand deals; not appropriate at 100k+.
 */

export const CatalogOverviewSchema = z.object({
  totals: z.object({
    deals: z.number().int().nonnegative(),
    categories: z.number().int().nonnegative(),
    locations: z.number().int().nonnegative(),
    merchants: z.number().int().nonnegative(),
  }),
  prices: z.object({
    count: z.number().int().nonnegative(),
    minEuros: z.number().nullable(),
    medianEuros: z.number().nullable(),
    meanEuros: z.number().nullable(),
    maxEuros: z.number().nullable(),
    stdDevEuros: z.number().nullable(),
  }),
  discounts: z.object({
    withDiscountCount: z.number().int().nonnegative(),
    meanPct: z.number().nullable(),
    medianPct: z.number().nullable(),
    buckets: z.array(z.object({ range: z.string(), count: z.number() })),
  }),
  topCategories: z.array(
    z.object({ slug: z.string(), name: z.string(), dealCount: z.number() }),
  ),
  topLocations: z.array(
    z.object({ slug: z.string(), name: z.string(), dealCount: z.number() }),
  ),
  topMerchants: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ratingAvg: z.number().nullable(),
      dealCount: z.number(),
    }),
  ),
  freshness: z.object({
    earliestScrapedAt: z.string().nullable(),
    latestScrapedAt: z.string().nullable(),
  }),
});

export type CatalogOverview = z.infer<typeof CatalogOverviewSchema>;
