import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore, analyzeMarket } from "../../core/index.js";
import { wrapUnknown } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";

const InputSchema = z.object({
  category: z
    .string()
    .min(1)
    .describe("Category slug (e.g. 'belleza', 'bienestar', 'gastronomia')."),
  location: z
    .string()
    .min(1)
    .describe("Location slug (e.g. 'madrid', 'barcelona')."),
});

const OutputSchema = z.object({
  segment: z.object({ category: z.string(), location: z.string() }),
  totalDeals: z.number(),
  prices: z.object({
    count: z.number(),
    minEuros: z.number().nullable(),
    medianEuros: z.number().nullable(),
    meanEuros: z.number().nullable(),
    maxEuros: z.number().nullable(),
    stdDevEuros: z.number().nullable(),
  }),
  discounts: z.object({
    buckets: z.array(z.object({ range: z.string(), count: z.number() })),
    meanPct: z.number().nullable(),
    medianPct: z.number().nullable(),
  }),
  topPerformers: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      merchantName: z.string().nullable(),
      priceEuros: z.number().nullable(),
      discountPct: z.number().nullable(),
      rating: z.number().nullable(),
    }),
  ),
  underservedNearbyLocations: z.array(z.string()),
  commonTitleTokens: z.array(
    z.object({
      token: z.string(),
      occurrences: z.number(),
      avgRating: z.number().nullable(),
      avgDiscountPct: z.number().nullable(),
    }),
  ),
});

export function registerAnalyzeMarket(
  server: McpServer,
  deps: { store: DealStore },
): void {
  server.registerTool(
    "analyze_market",
    {
      title: "Analyse merchant market",
      description:
        "Aggregate merchant-side intelligence for a (category, location) pair: price statistics, discount distribution, top-performing deals, underserved nearby locations and common copy patterns. Use this whenever a merchant or analyst asks 'how is my pricing positioned', 'what does the competition look like' or 'where else could I be selling'.",
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const analysis = analyzeMarket(deps.store, {
          categorySlug: args.category,
          locationSlug: args.location,
        });
        const structured = {
          segment: { category: analysis.category, location: analysis.location },
          totalDeals: analysis.totalDeals,
          prices: {
            count: analysis.prices.count,
            minEuros: analysis.prices.min,
            medianEuros: analysis.prices.median,
            meanEuros: analysis.prices.mean,
            maxEuros: analysis.prices.max,
            stdDevEuros: analysis.prices.stdDev,
          },
          discounts: {
            buckets: analysis.discounts.buckets,
            meanPct: analysis.discounts.mean,
            medianPct: analysis.discounts.median,
          },
          topPerformers: analysis.topPerformers.map((d) => ({
            id: d.id,
            title: d.title,
            merchantName: d.merchantName,
            priceEuros: d.priceCents !== null ? d.priceCents / 100 : null,
            discountPct: d.discountPct,
            rating: d.rating,
          })),
          underservedNearbyLocations: analysis.underservedSubsegments,
          commonTitleTokens: analysis.commonTitleTokens,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        };
      } catch (err) {
        logger.error({ err, args }, "analyze_market failed");
        throw wrapUnknown(err, "analyze_market");
      }
    },
  );
}
