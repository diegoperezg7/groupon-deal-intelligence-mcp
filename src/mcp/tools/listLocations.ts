import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore } from "../../core/index.js";
import { wrapUnknown } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";

const InputSchema = z.object({});

const OutputSchema = z.object({
  count: z.number(),
  locations: z.array(
    z.object({ slug: z.string(), name: z.string(), dealCount: z.number() }),
  ),
});

export function registerListLocations(
  server: McpServer,
  deps: { store: DealStore },
): void {
  server.registerTool(
    "list_locations",
    {
      title: "List locations",
      description:
        "Return every location (city) present in the catalogue with its deal count. Call this when you need to know which city slugs are valid before passing one to search_deals or analyze_market.",
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      try {
        const locations = deps.store.listLocations();
        const structured = { count: locations.length, locations };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        };
      } catch (err) {
        logger.error({ err }, "list_locations failed");
        throw wrapUnknown(err, "list_locations");
      }
    },
  );
}
