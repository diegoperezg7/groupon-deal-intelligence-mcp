import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore, getDealDetails } from "../../core/index.js";
import { DealNotFoundError, wrapUnknown } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";

const InputSchema = z.object({
  idOrUrl: z
    .string()
    .min(1)
    .describe(
      "Deal id (the slug, e.g. 'blisstopia-masajes-1') or its full Groupon URL.",
    ),
});

const OutputSchema = z.object({
  deal: z.object({
    id: z.string(),
    url: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    merchantId: z.string().nullable(),
    merchantName: z.string().nullable(),
    category: z.string(),
    location: z.string(),
    priceEuros: z.number().nullable(),
    originalPriceEuros: z.number().nullable(),
    discountPct: z.number().nullable(),
    rating: z.number().nullable(),
    reviewsCount: z.number().nullable(),
    imageUrl: z.string().nullable(),
    scrapedAt: z.string(),
  }),
  merchant: z
    .object({
      id: z.string(),
      name: z.string(),
      ratingAvg: z.number().nullable(),
      dealCount: z.number(),
    })
    .nullable(),
});

export function registerGetDealDetails(
  server: McpServer,
  deps: { store: DealStore },
): void {
  server.registerTool(
    "get_deal_details",
    {
      title: "Get deal details",
      description:
        "Return the full record for a single deal — title, description, merchant, price/discount, rating and image. Use after search_deals when the user asks for more about a specific result, or any time the conversation references a deal id or URL.",
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const result = getDealDetails(deps.store, args.idOrUrl);
        if (!result) {
          throw new DealNotFoundError(args.idOrUrl);
        }
        const { deal, merchant } = result;
        const structured = {
          deal: {
            id: deal.id,
            url: deal.url,
            title: deal.title,
            description: deal.description,
            merchantId: deal.merchantId,
            merchantName: deal.merchantName,
            category: deal.categorySlug,
            location: deal.locationSlug,
            priceEuros: deal.priceCents !== null ? deal.priceCents / 100 : null,
            originalPriceEuros:
              deal.originalPriceCents !== null ? deal.originalPriceCents / 100 : null,
            discountPct: deal.discountPct,
            rating: deal.rating,
            reviewsCount: deal.reviewsCount,
            imageUrl: deal.imageUrl,
            scrapedAt: deal.scrapedAt,
          },
          merchant: merchant
            ? {
                id: merchant.id,
                name: merchant.name,
                ratingAvg: merchant.ratingAvg,
                dealCount: merchant.dealCount,
              }
            : null,
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(structured, null, 2) },
          ],
          structuredContent: structured,
        };
      } catch (err) {
        logger.error({ err, args }, "get_deal_details failed");
        throw wrapUnknown(err, "get_deal_details");
      }
    },
  );
}
