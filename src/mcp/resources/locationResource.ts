import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { DealStore } from "../../core/index.js";

export function registerLocationResource(
  server: McpServer,
  deps: { store: DealStore },
): void {
  const template = new ResourceTemplate("groupon://location/{slug}", {
    list: async () => {
      const locations = deps.store.listLocations();
      return {
        resources: locations.map((l) => ({
          uri: `groupon://location/${l.slug}`,
          name: l.name,
          description: `${l.dealCount} deals`,
          mimeType: "application/json",
        })),
      };
    },
  });

  server.registerResource(
    "location",
    template,
    {
      title: "Location",
      description:
        "All deals available in a city. Reading this resource returns the up-to-20 most attractive deals there (by discount, then rating).",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const slug = String(variables.slug ?? "");
      const deals = deps.store.listDeals({ locationSlug: slug, limit: 20 });
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
