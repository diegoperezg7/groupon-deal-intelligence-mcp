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

  // Build the server with the fake embeddings provider
  serverInstance = new McpServer(
    { name: "test-server", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  registerSearchDeals(serverInstance, { store, embeddings: new FakeEmbeddings() });
  registerGetDealDetails(serverInstance, { store });
  registerListCategories(serverInstance, { store });
  registerListLocations(serverInstance, { store });
  registerCompareDeals(serverInstance, { store });

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
  it("lists tools", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain("search_deals");
    expect(names).toContain("get_deal_details");
    expect(names).toContain("list_categories");
    expect(names).toContain("list_locations");
    expect(names).toContain("compare_deals");
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
});
