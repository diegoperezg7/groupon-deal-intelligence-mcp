import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

import { DealStore } from "../../src/core/store/index.js";
import { registerSearchDeals } from "../../src/mcp/tools/searchDeals.js";
import { registerGetDealDetails } from "../../src/mcp/tools/getDealDetails.js";
import { registerListCategories } from "../../src/mcp/tools/listCategories.js";
import { registerListLocations } from "../../src/mcp/tools/listLocations.js";
import { registerCompareDeals } from "../../src/mcp/tools/compareDeals.js";
import { registerFindSimilarDeals } from "../../src/mcp/tools/findSimilarDeals.js";
import { registerAnalyzeMarket } from "../../src/mcp/tools/analyzeMarket.js";
import { registerCategoryInsights } from "../../src/mcp/tools/categoryInsights.js";
import { registerDealResource } from "../../src/mcp/resources/dealResource.js";
import { registerCategoryResource } from "../../src/mcp/resources/categoryResource.js";
import { registerLocationResource } from "../../src/mcp/resources/locationResource.js";
import { registerAnalyzeMyPricing } from "../../src/mcp/prompts/analyzeMyPricing.js";
import { registerFindArbitrage } from "../../src/mcp/prompts/findArbitrage.js";
import { registerCompareDealsPrompt } from "../../src/mcp/prompts/compareDeals.js";
import type { EmbeddingsProvider } from "../../src/core/embeddings/index.js";

/**
 * Integration test: spin up the MCP server in-process, connect a Client
 * via InMemoryTransport (the official pattern from the SDK's own tests),
 * call each tool and assert the structuredContent shape.
 *
 * Embeddings are stubbed with a deterministic fake provider so the test
 * is fully offline.
 */

const TEST_DB = resolve(tmpdir(), `groupon-test-${Date.now()}.sqlite`);

class FakeEmbeddings implements EmbeddingsProvider {
  readonly name = "fake";
  readonly dimension = 1536;
  async embed(text: string): Promise<number[]> {
    // Deterministic per text — just a stable hash projection
    const vec = new Array(1536).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % 1536] += text.charCodeAt(i) / 255;
    }
    return vec;
  }
  async embedMany(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

let store: DealStore;
let client: Client;
let serverInstance: McpServer;

beforeAll(async () => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  store = new DealStore(TEST_DB, { applySchema: true });

  // Seed minimal data
  const seed = (
    store as unknown as { db: import("better-sqlite3").Database }
  ).db;
  seed.prepare("INSERT INTO categories(slug,name) VALUES (?,?)").run("bienestar", "Bienestar");
  seed.prepare("INSERT INTO locations(slug,name) VALUES (?,?)").run("madrid", "Madrid");
  seed.prepare("INSERT INTO merchants(id,name) VALUES (?,?)").run("blisstopia", "Blisstopia");
  seed
    .prepare(
      `INSERT INTO deals(id,url,title,description,merchant_id,merchant_name,
         category_slug,location_slug,price_cents,original_price_cents,discount_pct,
         rating,reviews_count,image_url,scraped_at,raw_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      "test-deal-1",
      "https://www.groupon.es/deals/test-deal-1",
      "Spa relajante en Madrid",
      "Sesion de spa con masaje",
      "blisstopia",
      "Blisstopia",
      "bienestar",
      "madrid",
      2999,
      5999,
      50,
      4.5,
      120,
      null,
      new Date().toISOString(),
      "{}",
    );
  seed
    .prepare(
      `INSERT INTO deals(id,url,title,description,merchant_id,merchant_name,
         category_slug,location_slug,price_cents,original_price_cents,discount_pct,
         rating,reviews_count,image_url,scraped_at,raw_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      "test-deal-2",
      "https://www.groupon.es/deals/test-deal-2",
      "Masaje completo en Madrid",
      "Masaje terapeutico",
      "blisstopia",
      "Blisstopia",
      "bienestar",
      "madrid",
      4999,
      8999,
      45,
      4.2,
      80,
      null,
      new Date().toISOString(),
      "{}",
    );
  seed
    .prepare(`UPDATE categories SET deal_count=(SELECT COUNT(*) FROM deals WHERE category_slug=categories.slug)`)
    .run();
  seed
    .prepare(`UPDATE locations SET deal_count=(SELECT COUNT(*) FROM deals WHERE location_slug=locations.slug)`)
    .run();

  // Add an embedding for test-deal-1 so similarity/search smoke tests
  // have data to return.
  const stubEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i) * 0.01);
  const embedBuffer = Buffer.alloc(stubEmbedding.length * 4);
  for (let i = 0; i < stubEmbedding.length; i++) {
    embedBuffer.writeFloatLE(stubEmbedding[i], i * 4);
  }
  seed
    .prepare("INSERT INTO deal_vectors(deal_id, embedding) VALUES (?, ?)")
    .run("test-deal-1", embedBuffer);
  seed
    .prepare("INSERT INTO deal_vectors(deal_id, embedding) VALUES (?, ?)")
    .run("test-deal-2", embedBuffer);

  // Build the server with the fake embeddings provider, registering the
  // FULL surface so the integration test catches breakage across tools,
  // resources AND prompts.
  serverInstance = new McpServer(
    { name: "test-server", version: "0.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );
  registerSearchDeals(serverInstance, { store, embeddings: new FakeEmbeddings() });
  registerGetDealDetails(serverInstance, { store });
  registerFindSimilarDeals(serverInstance, { store });
  registerCompareDeals(serverInstance, { store });
  registerAnalyzeMarket(serverInstance, { store });
  registerCategoryInsights(serverInstance, { store });
  registerListCategories(serverInstance, { store });
  registerListLocations(serverInstance, { store });
  registerDealResource(serverInstance, { store });
  registerCategoryResource(serverInstance, { store });
  registerLocationResource(serverInstance, { store });
  registerAnalyzeMyPricing(serverInstance);
  registerFindArbitrage(serverInstance);
  registerCompareDealsPrompt(serverInstance);

  // Connect in-memory client
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    serverInstance.connect(serverTransport),
    client.connect(clientTransport),
  ]);
});

afterAll(async () => {
  await client.close();
  store.close();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("MCP server integration", () => {
  it("lists all 8 tools", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    for (const expected of [
      "search_deals",
      "get_deal_details",
      "find_similar_deals",
      "compare_deals",
      "analyze_market",
      "category_insights",
      "list_categories",
      "list_locations",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("lists 3 resource templates", async () => {
    const resources = await client.listResourceTemplates();
    const uris = resources.resourceTemplates.map((r) => r.uriTemplate);
    expect(uris).toContain("groupon://deal/{id}");
    expect(uris).toContain("groupon://category/{slug}");
    expect(uris).toContain("groupon://location/{slug}");
  });

  it("lists 3 prompts", async () => {
    const prompts = await client.listPrompts();
    const names = prompts.prompts.map((p) => p.name);
    expect(names).toContain("analyze_my_pricing");
    expect(names).toContain("find_arbitrage");
    expect(names).toContain("compare_deals");
  });

  it("tools declare readOnly annotations", async () => {
    const tools = await client.listTools();
    for (const t of tools.tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
    }
  });

  it("list_categories returns structured content", async () => {
    const result = await client.callTool({
      name: "list_categories",
      arguments: {},
    });
    const structured = result.structuredContent as { count: number; categories: unknown[] };
    expect(structured.count).toBeGreaterThan(0);
    expect(Array.isArray(structured.categories)).toBe(true);
  });

  it("list_locations returns Madrid", async () => {
    const result = await client.callTool({
      name: "list_locations",
      arguments: {},
    });
    const structured = result.structuredContent as {
      locations: { slug: string }[];
    };
    expect(structured.locations.some((l) => l.slug === "madrid")).toBe(true);
  });

  it("get_deal_details returns the seeded deal", async () => {
    const result = await client.callTool({
      name: "get_deal_details",
      arguments: { idOrUrl: "test-deal-1" },
    });
    const structured = result.structuredContent as {
      deal: { title: string };
    };
    expect(structured.deal.title).toContain("Spa");
  });

  it("compare_deals ranks two deals", async () => {
    const result = await client.callTool({
      name: "compare_deals",
      arguments: { idsOrUrls: ["test-deal-1", "test-deal-2"] },
    });
    const structured = result.structuredContent as {
      ranking: { rank: number; id: string }[];
      missing: string[];
    };
    expect(structured.ranking).toHaveLength(2);
    expect(structured.missing).toHaveLength(0);
  });

  it("analyze_market returns a structured segment report", async () => {
    const result = await client.callTool({
      name: "analyze_market",
      arguments: { category: "bienestar", location: "madrid" },
    });
    const structured = result.structuredContent as {
      segment: { category: string; location: string };
      totalDeals: number;
      prices: { count: number };
    };
    expect(structured.segment.category).toBe("bienestar");
    expect(structured.segment.location).toBe("madrid");
    expect(structured.totalDeals).toBeGreaterThanOrEqual(0);
  });

  it("category_insights returns per-location breakdown", async () => {
    const result = await client.callTool({
      name: "category_insights",
      arguments: { category: "bienestar" },
    });
    const structured = result.structuredContent as {
      category: string;
      totalDeals: number;
      locations: { slug: string }[];
    };
    expect(structured.category).toBe("bienestar");
    expect(Array.isArray(structured.locations)).toBe(true);
  });

  it("search_deals returns ranked results", async () => {
    const result = await client.callTool({
      name: "search_deals",
      arguments: { query: "masaje relajante", limit: 5 },
    });
    const structured = result.structuredContent as {
      count: number;
      results: { id: string; similarity: number }[];
    };
    expect(structured.count).toBeGreaterThan(0);
    expect(structured.results[0].similarity).toBeGreaterThan(0);
  });

  it("find_similar_deals returns the reference + neighbours", async () => {
    const result = await client.callTool({
      name: "find_similar_deals",
      arguments: { idOrUrl: "test-deal-1", limit: 3 },
    });
    const structured = result.structuredContent as {
      reference: { id: string };
      similar: { id: string }[];
    };
    expect(structured.reference.id).toBe("test-deal-1");
    expect(Array.isArray(structured.similar)).toBe(true);
  });

  it("reads a deal resource directly", async () => {
    const res = await client.readResource({ uri: "groupon://deal/test-deal-1" });
    expect(res.contents.length).toBeGreaterThan(0);
    const blob = JSON.parse(String(res.contents[0].text));
    expect(blob.id).toBe("test-deal-1");
  });

  it("retrieves a prompt with bound arguments", async () => {
    const res = await client.getPrompt({
      name: "analyze_my_pricing",
      arguments: { category: "bienestar", location: "madrid", myPriceEuros: "49.99" },
    });
    expect(res.messages).toHaveLength(1);
    const text = String((res.messages[0].content as { text: string }).text);
    expect(text).toContain("bienestar");
    expect(text).toContain("madrid");
  });
});
