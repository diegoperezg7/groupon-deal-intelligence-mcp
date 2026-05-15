import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore, buildCatalogOverview } from "../../core/index.js";
import { wrapUnknown } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";

const InputSchema = z.object({});

const OutputSchema = z.object({
  totals: z.object({
    deals: z.number(),
    categories: z.number(),
    locations: z.number(),
    merchants: z.number(),
  }),
  prices: z.object({
    count: z.number(),
    minEuros: z.number().nullable(),
    medianEuros: z.number().nullable(),
    meanEuros: z.number().nullable(),
    maxEuros: z.number().nullable(),
    stdDevEuros: z.number().nullable(),
  }),
  discounts: z.object({
    withDiscountCount: z.number(),
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

export function registerCatalogOverview(
  server: McpServer,
  deps: { store: DealStore },
): void {
  server.registerTool(
    "get_catalog_overview",
    {
      title: "Get catalogue overview",
      description:
        "Single-call orientation snapshot: total deals/categories/locations/merchants, price and discount distribution, top 5 categories/locations/merchants and data freshness. The cheapest bootstrap call for a fresh session — use it once at the start to understand the scope of the catalogue before forming queries.",
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const overview = buildCatalogOverview(deps.store);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(overview, null, 2) },
          ],
          structuredContent: overview,
        };
      } catch (err) {
        logger.error({ err }, "get_catalog_overview failed");
        throw wrapUnknown(err, "get_catalog_overview");
      }
    },
  );
}
