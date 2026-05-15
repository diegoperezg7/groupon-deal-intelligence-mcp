import { z } from "zod";
import { DealSchema } from "./deal.js";

export const PriceStatsSchema = z.object({
  count: z.number().int().nonnegative(),
  min: z.number().nonnegative().nullable(),
  median: z.number().nonnegative().nullable(),
  mean: z.number().nonnegative().nullable(),
  max: z.number().nonnegative().nullable(),
  stdDev: z.number().nonnegative().nullable(),
});
export type PriceStats = z.infer<typeof PriceStatsSchema>;

export const DiscountDistributionSchema = z.object({
  buckets: z.array(
    z.object({
      range: z.string(), // e.g. "0-20%", "20-40%", ...
      count: z.number().int().nonnegative(),
    }),
  ),
  mean: z.number().nullable(),
  median: z.number().nullable(),
});
export type DiscountDistribution = z.infer<typeof DiscountDistributionSchema>;

export const CopyPatternSchema = z.object({
  token: z.string(),
  occurrences: z.number().int().nonnegative(),
  avgRating: z.number().min(0).max(5).nullable(),
  avgDiscountPct: z.number().nullable(),
});
export type CopyPattern = z.infer<typeof CopyPatternSchema>;

export const MarketAnalysisSchema = z.object({
  category: z.string(),
  location: z.string(),
  totalDeals: z.number().int().nonnegative(),
  prices: PriceStatsSchema,
  discounts: DiscountDistributionSchema,
  topPerformers: z.array(DealSchema).max(10),
  underservedSubsegments: z.array(z.string()),
  commonTitleTokens: z.array(CopyPatternSchema).max(20),
  narrative: z.string().nullable(),
});
export type MarketAnalysis = z.infer<typeof MarketAnalysisSchema>;

export const CategoryInsightsSchema = z.object({
  category: z.string(),
  totalDeals: z.number().int().nonnegative(),
  locations: z.array(
    z.object({
      slug: z.string(),
      dealCount: z.number().int().nonnegative(),
      avgPriceCents: z.number().nullable(),
      avgDiscountPct: z.number().nullable(),
      avgRating: z.number().min(0).max(5).nullable(),
    }),
  ),
  prices: PriceStatsSchema,
  topPerformers: z.array(DealSchema).max(10),
});
export type CategoryInsights = z.infer<typeof CategoryInsightsSchema>;
