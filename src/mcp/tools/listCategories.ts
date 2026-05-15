import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore } from "../../core/index.js";
import { wrapUnknown } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";

const InputSchema = z.object({});

const OutputSchema = z.object({
  count: z.number(),
  categories: z.array(
    z.object({ slug: z.string(), name: z.string(), dealCount: z.number() }),
  ),
});

export function registerListCategories(
  server: McpServer,
  deps: { store: DealStore },
): void {
  server.registerTool(
    "list_categories",
    {
      title: "List categories",
      description:
        "Return every category present in the catalogue with its deal count. Useful for discovery: call this first when you don't yet know which category slugs are available.",
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      try {
        const categories = deps.store.listCategories();
        const structured = { count: categories.length, categories };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        };
      } catch (err) {
        logger.error({ err }, "list_categories failed");
        throw wrapUnknown(err, "list_categories");
      }
    },
  );
}
