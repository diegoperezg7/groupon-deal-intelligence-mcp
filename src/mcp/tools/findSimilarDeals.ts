import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore, findSimilarDeals } from "../../core/index.js";
import { DealNotFoundError, wrapUnknown } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";

const InputSchema = z.object({
  idOrUrl: z.string().min(1).describe("Reference deal id or URL."),
  limit: z.number().int().min(1).max(20).default(5),
  sameCategory: z
    .boolean()
    .optional()
    .describe("Restrict results to the same category as the reference."),
  sameLocation: z
    .boolean()
    .optional()
    .describe("Restrict results to the same location as the reference."),
});

const OutputSchema = z.object({
  reference: z.object({
    id: z.string(),
    title: z.string(),
    category: z.string(),
    location: z.string(),
  }),
  similar: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      title: z.string(),
      merchantName: z.string().nullable(),
      category: z.string(),
      location: z.string(),
      priceEuros: z.number().nullable(),
      discountPct: z.number().nullable(),
      rating: z.number().nullable(),
      similarity: z.number(),
    }),
  ),
});

export function registerFindSimilarDeals(
  server: McpServer,
  deps: { store: DealStore },
): void {
  server.registerTool(
    "find_similar_deals",
    {
      title: "Find similar deals",
      description:
        "Given a reference deal, return semantically similar ones based on their stored embeddings. Useful when the user wants alternatives to a specific deal they've already seen.",
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const ref = deps.store.getDealById(args.idOrUrl) ?? deps.store.getDealByUrl(args.idOrUrl);
        const filters = {
          categorySlug: args.sameCategory && ref ? ref.categorySlug : undefined,
          locationSlug: args.sameLocation && ref ? ref.locationSlug : undefined,
        };
        const result = findSimilarDeals(deps.store, args.idOrUrl, {
          limit: args.limit,
          excludeSelf: true,
          ...filters,
        });
        if (!result) {
          throw new DealNotFoundError(args.idOrUrl);
        }
        const structured = {
          reference: {
            id: result.reference.id,
            title: result.reference.title,
            category: result.reference.categorySlug,
            location: result.reference.locationSlug,
          },
          similar: result.similar.map((s) => ({
            id: s.id,
            url: s.url,
            title: s.title,
            merchantName: s.merchantName,
            category: s.categorySlug,
            location: s.locationSlug,
            priceEuros: s.priceCents !== null ? s.priceCents / 100 : null,
            discountPct: s.discountPct,
            rating: s.rating,
            similarity: Number(s.similarity.toFixed(4)),
          })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        };
      } catch (err) {
        logger.error({ err, args }, "find_similar_deals failed");
        throw wrapUnknown(err, "find_similar_deals");
      }
    },
  );
}
