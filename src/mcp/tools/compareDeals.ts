import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore, compareDeals } from "../../core/index.js";
import { wrapUnknown } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";

const InputSchema = z.object({
  idsOrUrls: z
    .array(z.string().min(1))
    .min(2)
    .max(10)
    .describe("Between 2 and 10 deal ids or URLs to compare side-by-side."),
});

const OutputSchema = z.object({
  ranking: z.array(
    z.object({
      rank: z.number().int(),
      id: z.string(),
      title: z.string(),
      merchantName: z.string().nullable(),
      priceEuros: z.number().nullable(),
      discountPct: z.number().nullable(),
      rating: z.number().nullable(),
      reviewsCount: z.number().nullable(),
      score: z.number(),
      scoreBreakdown: z.object({
        discount: z.number(),
        rating: z.number(),
        popularity: z.number(),
        price: z.number(),
      }),
    }),
  ),
  missing: z.array(z.string()),
  summary: z.string(),
});

export function registerCompareDeals(
  server: McpServer,
  deps: { store: DealStore },
): void {
  server.registerTool(
    "compare_deals",
    {
      title: "Compare deals",
      description:
        "Score and rank 2 to 10 deals side-by-side using a deterministic attractiveness score (discount, rating, popularity, price relative to peer median). Returns the ranked list plus a breakdown of each score so you can explain *why* one wins.",
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const { deals, missing } = compareDeals(deps.store, args.idsOrUrls);
        const ranking = deals.map((d, i) => ({
          rank: i + 1,
          id: d.id,
          title: d.title,
          merchantName: d.merchantName,
          priceEuros: d.priceCents !== null ? d.priceCents / 100 : null,
          discountPct: d.discountPct,
          rating: d.rating,
          reviewsCount: d.reviewsCount,
          score: d.score,
          scoreBreakdown: {
            discount: Number(d.scoreBreakdown.discount.toFixed(2)),
            rating: Number(d.scoreBreakdown.rating.toFixed(2)),
            popularity: Number(d.scoreBreakdown.popularity.toFixed(2)),
            price: Number(d.scoreBreakdown.price.toFixed(2)),
          },
        }));
        const summary =
          ranking.length === 0
            ? "No deals could be resolved from the inputs."
            : `Ranked ${ranking.length} deal${ranking.length === 1 ? "" : "s"}. Top: '${ranking[0].title}' (score ${ranking[0].score}).` +
              (missing.length > 0 ? ` Skipped: ${missing.length} unknown id(s).` : "");
        const structured = { ranking, missing, summary };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        };
      } catch (err) {
        logger.error({ err, args }, "compare_deals failed");
        throw wrapUnknown(err, "compare_deals");
      }
    },
  );
}
