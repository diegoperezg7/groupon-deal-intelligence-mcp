import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore } from "../../core/index.js";

export function registerCategoryResource(
  server: McpServer,
  deps: { store: DealStore },
): void {
  const template = new ResourceTemplate("groupon://category/{slug}", {
    list: async () => {
      const categories = deps.store.listCategories();
      return {
        resources: categories.map((c) => ({
          uri: `groupon://category/${c.slug}`,
          name: c.name,
          description: `${c.dealCount} deals`,
          mimeType: "application/json",
        })),
      };
    },
  });

  server.registerResource(
    "category",
    template,
    {
      title: "Category",
      description:
        "All deals within a category. Reading this resource returns the up-to-20 most attractive deals (by discount, then rating).",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const slug = String(variables.slug ?? "");
      const deals = deps.store.listDeals({ categorySlug: slug, limit: 20 });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ slug, count: deals.length, deals }, null, 2),
          },
        ],
      };
    },
  );
}
