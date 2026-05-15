import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore } from "../../core/index.js";
import { wrapUnknown } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";

const InputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe("How many merchants to return (1..500, default 100)."),
  sort: z
    .enum(["dealCount", "rating", "name"])
    .default("dealCount")
    .describe(
      "Sort key. 'dealCount' (default) shows the most prolific merchants first; 'rating' surfaces best-reviewed merchants; 'name' is alphabetical.",
    ),
});

const OutputSchema = z.object({
  count: z.number(),
  merchants: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ratingAvg: z.number().nullable(),
      dealCount: z.number(),
    }),
  ),
});

export function registerListMerchants(
  server: McpServer,
  deps: { store: DealStore },
): void {
  server.registerTool(
    "list_merchants",
    {
      title: "List merchants",
      description:
        "Return the set of merchants in the catalogue with their deal count and average rating. Use this before filtering search_deals by merchant id, or to surface top operators in the marketplace.",
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args) => {
      try {
        const merchants = deps.store.listMerchants({
          limit: args.limit,
          sort: args.sort,
        });
        const structured = { count: merchants.length, merchants };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(structured, null, 2) },
          ],
          structuredContent: structured,
        };
      } catch (err) {
        logger.error({ err, args }, "list_merchants failed");
        throw wrapUnknown(err, "list_merchants");
      }
    },
  );
}
