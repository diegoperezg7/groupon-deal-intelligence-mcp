import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore } from "../../core/index.js";

/**
 * Resource: groupon://deal/{id}
 *
 * Lets MCP clients ask the server "show me the contents of this URI"
 * without invoking a tool. Useful for context injection — Claude
 * Desktop renders resources inline.
 */
export function registerDealResource(
  server: McpServer,
  deps: { store: DealStore },
): void {
  const template = new ResourceTemplate("groupon://deal/{id}", {
    list: async () => {
      const deals = deps.store.listDeals({ limit: 200 });
      return {
        resources: deals.map((d) => ({
          uri: `groupon://deal/${d.id}`,
          name: d.title,
          description: `${d.locationSlug} · ${d.categorySlug}`,
          mimeType: "application/json",
        })),
      };
    },
  });

  server.registerResource(
    "deal",
    template,
    {
      title: "Deal",
      description:
        "A single groupon.es deal — title, description, price, discount, rating and merchant.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const id = String(variables.id ?? "");
      const deal = deps.store.getDealById(id);
      if (!deal) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: `Deal not found: ${id}` }),
            },
          ],
        };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(deal, null, 2),
          },
        ],
      };
    },
  );
}
