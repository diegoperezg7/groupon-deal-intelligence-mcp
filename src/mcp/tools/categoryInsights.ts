import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore, getCategoryInsights } from "../../core/index.js";
import { wrapUnknown } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";

const InputSchema = z.object({
  category: z
    .string()
    .min(1)
    .describe("Category slug (e.g. 'belleza', 'gastronomia', 'escapadas')."),
});

const OutputSchema = z.object({
  category: z.string(),
  totalDeals: z.number(),
  prices: z.object({
    count: z.number(),
    minEuros: z.number().nullable(),
    medianEuros: z.number().nullable(),
    meanEuros: z.number().nullable(),
    maxEuros: z.number().nullable(),
  }),
  locations: z.array(
    z.object({
      slug: z.string(),
      dealCount: z.number(),
      avgPriceEuros: z.number().nullable(),
      avgDiscountPct: z.number().nullable(),
      avgRating: z.number().nullable(),
    }),
  ),
  topPerformers: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      location: z.string(),
      priceEuros: z.number().nullable(),
      discountPct: z.number().nullable(),
      rating: z.number().nullable(),
    }),
  ),
});

export function registerCategoryInsights(
  server: McpServer,
  deps: { store: DealStore },
): void {
  server.registerTool(
    "category_insights",
    {
      title: "Category insights across cities",
      description:
        "Per-location breakdown for one category across all locations in the catalogue. Useful for 'where is wellness cheapest', 'which city has the highest-rated restaurants', 'where do escapadas convert best'.",
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const insights = getCategoryInsights(deps.store, args.category);
        const structured = {
          category: insights.category,
          totalDeals: insights.totalDeals,
          prices: {
            count: insights.prices.count,
            minEuros: insights.prices.min,
            medianEuros: insights.prices.median,
            meanEuros: insights.prices.mean,
            maxEuros: insights.prices.max,
          },
          locations: insights.locations.map((l) => ({
            slug: l.slug,
            dealCount: l.dealCount,
            avgPriceEuros: l.avgPriceCents !== null ? l.avgPriceCents / 100 : null,
            avgDiscountPct: l.avgDiscountPct,
            avgRating: l.avgRating,
          })),
          topPerformers: insights.topPerformers.map((d) => ({
            id: d.id,
            title: d.title,
            location: d.locationSlug,
            priceEuros: d.priceCents !== null ? d.priceCents / 100 : null,
            discountPct: d.discountPct,
            rating: d.rating,
          })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        };
      } catch (err) {
        logger.error({ err, args }, "category_insights failed");
        throw wrapUnknown(err, "category_insights");
      }
    },
  );
}
