import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWebConfig } from "./config.js";
import { logger } from "./logger.js";
import { listMcpTools, pingMcpServer } from "./mcp-client.js";
import { registerChatRoute } from "./chat.js";
import { registerDealsRoute } from "./deals.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const cfg = loadWebConfig();

  // Ping MCP up-front so a misconfigured MCP_URL fails fast.
  await pingMcpServer();
  const tools = await listMcpTools();
  logger.info({ tools: tools.map((t) => t.name) }, "MCP tools discovered");

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  // No compression() here — it buffers responses and breaks SSE streaming.

  app.get("/healthz", async (_req, res) => {
    res.json({
      ok: true,
      mcp_tools: tools.length,
      llm_model: cfg.LLM_MODEL,
      llm_base_url: cfg.LLM_BASE_URL,
      mcp_url: cfg.MCP_URL,
    });
  });

  registerDealsRoute(app);
  registerChatRoute(app);

  // Serve the built frontend in production (dist/static).
  const staticDir = resolve(__dirname, "..", "static");
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("*", (_req, res) => {
      res.sendFile(resolve(staticDir, "index.html"));
    });
  }

  const server = app.listen(cfg.WEB_PORT, () => {
    logger.info(
      { port: cfg.WEB_PORT, env: cfg.NODE_ENV },
      `Web BFF listening at http://localhost:${cfg.WEB_PORT}`,
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "Web BFF failed to start");
  process.exit(1);
});
