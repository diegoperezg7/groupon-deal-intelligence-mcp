import type { Express } from "express";
import { callMcpTool, listMcpTools } from "./mcp-client.js";
import { logger } from "./logger.js";

/**
 * GET /api/deals/:id — thin proxy used by the frontend's DealCard
 * component to verify a slug really exists before rendering a card.
 * Returns 404 on miss, the deal record on hit.
 */
export function registerDealsRoute(app: Express): void {
  app.get("/api/deals/:id", async (req, res) => {
    const id = req.params.id;
    try {
      const result = await callMcpTool("get_deal_details", { idOrUrl: id });
      if (result.isError) {
        res.status(404).json({ error: "deal not found" });
        return;
      }
      res.json(result.structuredContent ?? {});
    } catch (err) {
      logger.error({ err, id }, "GET /api/deals/:id failed");
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/tools", async (_req, res) => {
    try {
      const tools = await listMcpTools();
      res.json({
        count: tools.length,
        tools: tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
        })),
      });
    } catch (err) {
      logger.error({ err }, "GET /api/tools failed");
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
