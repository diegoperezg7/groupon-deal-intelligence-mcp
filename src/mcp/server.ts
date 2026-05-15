import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer, type IncomingMessage } from "node:http";

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
    return;
  }

  // Streamable HTTP transport (stateless mode — no sessions).
  // The 2025-03-26 spec endpoint is a single path that accepts POST
  // (JSON-RPC requests) and GET (SSE for server-initiated messages).
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  const httpServer = createHttpServer(async (req, res) => {
    const url = req.url ?? "";
    if (!url.startsWith("/mcp")) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    try {
      let parsedBody: unknown;
      if (req.method === "POST") {
        parsedBody = await readJsonBody(req);
      }
      await transport.handleRequest(req, res, parsedBody);
    } catch (err) {
      logger.error({ err, url, method: req.method }, "HTTP request failed");
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal error" },
            id: null,
          }),
        );
      }
    }
  });

  await new Promise<void>((resolve) =>
    httpServer.listen(cfg.MCP_HTTP_PORT, () => {
      logger.info(
        { port: cfg.MCP_HTTP_PORT, endpoint: `http://localhost:${cfg.MCP_HTTP_PORT}/mcp` },
        "MCP server listening on Streamable HTTP",
      );
      resolve();
    }),
  );
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return undefined;
  return JSON.parse(raw);
}

// Run when invoked directly (the bin entry in package.json)
const isMain = import.meta.url.endsWith(process.argv[1] ?? "");
if (isMain || process.argv[1]?.includes("server")) {
  startServer().catch((err) => {
    logger.fatal({ err }, "Server failed to start");
    process.exit(1);
  });
}
