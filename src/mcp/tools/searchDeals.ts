import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore, type EmbeddingsProvider, searchDeals } from "../../core/index.js";
import { logger } from "../../shared/logger.js";
import { wrapUnknown } from "../../shared/errors.js";

const InputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(300)
    .describe(
      "Natural-language search query in Spanish or English (e.g. 'romantic spa weekend in pareja', 'cena italiana barata'). Leave empty (use empty string) to browse without semantic ranking.",
    ),
  location: z
    .string()
    .optional()
    .describe(
      "City slug to filter by — one of madrid, barcelona, valencia, sevilla, bilbao, malaga, zaragoza. Use list_locations to discover available slugs.",
    ),
  category: z
    .string()
    .optional()
    .describe(
      "Category slug to filter by — e.g. belleza, gastronomia, bienestar, escapadas, cosas-que-hacer, cursos. Use list_categories to discover slugs.",
    ),
  maxPriceEuros: z
    .number()
    .positive()
    .optional()
    .describe("Cap on the deal price in EUR (inclusive)."),
  minRating: z
    .number()
    .min(0)
    .max(5)
    .optional()
    .describe("Minimum customer rating (0..5)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("How many deals to return (1..50, default 10)."),
});

const ResultDealSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  merchantName: z.string().nullable(),
  category: z.string(),
  location: z.string(),
  priceEuros: z.number().nullable(),
  originalPriceEuros: z.number().nullable(),
  discountPct: z.number().nullable(),
  rating: z.number().nullable(),
  reviewsCount: z.number().nullable(),
  similarity: z.number(),
});
const OutputSchema = z.object({
  count: z.number(),
  query: z.string(),
  results: z.array(ResultDealSchema),
});

export function registerSearchDeals(
  server: McpServer,
  deps: { store: DealStore; embeddings: EmbeddingsProvider },
): void {
  server.registerTool(
    "search_deals",
    {
      title: "Search deals",
      description:
        "Semantic + filtered search across groupon.es deals. Use whenever the user is looking for offers matching a natural-language description, optionally narrowed by city, category, price ceiling or rating floor. Returns deals ranked by relevance.",
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const results = await searchDeals(deps, {
          query: args.query,
          locationSlug: args.location,
          categorySlug: args.category,
          maxPriceCents:
            args.maxPriceEuros !== undefined
              ? Math.round(args.maxPriceEuros * 100)
              : undefined,
          minRating: args.minRating,
          limit: args.limit,
        });

        const structured = {
          count: results.length,
          query: args.query,
          results: results.map((r) => ({
            id: r.id,
            url: r.url,
            title: r.title,
            merchantName: r.merchantName,
            category: r.categorySlug,
            location: r.locationSlug,
            priceEuros: r.priceCents !== null ? r.priceCents / 100 : null,
            originalPriceEuros:
              r.originalPriceCents !== null ? r.originalPriceCents / 100 : null,
            discountPct: r.discountPct,
            rating: r.rating,
            reviewsCount: r.reviewsCount,
            similarity: Number(r.similarity.toFixed(4)),
          })),
        };

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(structured, null, 2) },
          ],
          structuredContent: structured,
        };
      } catch (err) {
        logger.error({ err, args }, "search_deals failed");
        throw wrapUnknown(err, "search_deals");
      }
    },
  );
}
