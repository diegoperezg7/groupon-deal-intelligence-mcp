import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "../shared/config.js";
import { logger } from "../shared/logger.js";
import { DealStore, getEmbeddingsProvider } from "../core/index.js";

import { registerSearchDeals } from "./tools/searchDeals.js";
import { registerGetDealDetails } from "./tools/getDealDetails.js";
import { registerFindSimilarDeals } from "./tools/findSimilarDeals.js";
import { registerCompareDeals } from "./tools/compareDeals.js";
import { registerAnalyzeMarket } from "./tools/analyzeMarket.js";
import { registerCategoryInsights } from "./tools/categoryInsights.js";
import { registerListCategories } from "./tools/listCategories.js";
import { registerListLocations } from "./tools/listLocations.js";

import { registerDealResource } from "./resources/dealResource.js";
import { registerCategoryResource } from "./resources/categoryResource.js";
import { registerLocationResource } from "./resources/locationResource.js";

import { registerAnalyzeMyPricing } from "./prompts/analyzeMyPricing.js";
import { registerFindArbitrage } from "./prompts/findArbitrage.js";
import { registerCompareDealsPrompt } from "./prompts/compareDeals.js";

const SERVER_INFO = {
  name: "groupon-es-deal-intelligence",
  version: "0.1.0",
};

const INSTRUCTIONS = `
This server exposes deal intelligence for the Spanish marketplace
groupon.es. Use it when the user asks about deals, ofertas, descuentos
or planes available in a Spanish city (Madrid, Barcelona, Valencia,
Sevilla, Bilbao, Malaga, Zaragoza) or in a category like wellness,
gastronomy, escapes, beauty, courses or activities.

Prices are in EUR. Most descriptions are in Spanish — feel free to
quote the original wording when relevant. The data is from a snapshot
crawl, not live, so this server cannot reserve, purchase or check
real-time availability — only describe and compare existing offers.

Prefer the high-level tools (analyze_market, category_insights,
compare_deals) when answering merchant-oriented questions; prefer
search_deals + get_deal_details when answering shopper-oriented
questions about a specific need.
`.trim();

export async function startServer(): Promise<void> {
  const cfg = loadConfig();
  logger.info({ transport: cfg.MCP_TRANSPORT }, "Starting MCP server");

  const store = new DealStore(cfg.SQLITE_PATH);
  const embeddings = getEmbeddingsProvider();

  const server = new McpServer(SERVER_INFO, {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
      logging: {},
    },
    instructions: INSTRUCTIONS,
  });

  // Tools
  registerSearchDeals(server, { store, embeddings });
  registerGetDealDetails(server, { store });
  registerFindSimilarDeals(server, { store });
  registerCompareDeals(server, { store });
  registerAnalyzeMarket(server, { store });
  registerCategoryInsights(server, { store });
  registerListCategories(server, { store });
  registerListLocations(server, { store });

  // Resources
  registerDealResource(server, { store });
  registerCategoryResource(server, { store });
  registerLocationResource(server, { store });

  // Prompts
  registerAnalyzeMyPricing(server);
  registerFindArbitrage(server);
  registerCompareDealsPrompt(server);

  if (cfg.MCP_TRANSPORT === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("MCP server connected over stdio");
  } else {
    // Streamable HTTP transport: declared in the plan, scaffolded here
    // as a friendly error so the build still passes if the http variant
    // isn't fully wired up.
    throw new Error(
      "Streamable HTTP transport is not yet wired up in this build. Use MCP_TRANSPORT=stdio.",
    );
  }
}

// Run when invoked directly (the bin entry in package.json)
const isMain = import.meta.url.endsWith(process.argv[1] ?? "");
if (isMain || process.argv[1]?.includes("server")) {
  startServer().catch((err) => {
    logger.fatal({ err }, "Server failed to start");
    process.exit(1);
  });
}
