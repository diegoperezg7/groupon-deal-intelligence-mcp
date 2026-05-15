import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { loadWebConfig } from "./config.js";
import { logger } from "./logger.js";

/**
 * Raw JSON-RPC client for the MCP Streamable HTTP server.
 *
 * Why not the SDK Client? The SDK assumes stateful sessions (mcp-session-id
 * header round-trip + a notifications/initialized handshake). Our server
 * runs in stateless mode — every request is independent — so the SDK
 * Client and the server can't agree on a session. A direct JSON-RPC POST
 * is simpler, has zero handshake overhead and exactly matches what the
 * server expects.
 *
 * The wire shape is exactly what `curl POST /mcp` would send. The response
 * comes back either as plain JSON or as a single SSE frame; we parse both.
 */

let toolsCache: Tool[] | undefined;
let nextId = 1;

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: number | string | null;
  result: T;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

async function rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const cfg = loadWebConfig();
  const id = nextId++;
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });

  const response = await fetch(cfg.MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`MCP HTTP ${response.status}: ${text}`);
  }

  const text = await response.text();
  const payload = parseResponseBody(text);
  if (!payload) {
    throw new Error(`MCP returned empty body for ${method}`);
  }

  const parsed = payload as JsonRpcResponse<T>;
  if ("error" in parsed) {
    throw new Error(`MCP ${method} error ${parsed.error.code}: ${parsed.error.message}`);
  }
  return parsed.result;
}

function parseResponseBody(text: string): unknown {
  // Server may respond with plain JSON or with a single SSE frame
  // (`event: message\ndata: { … }\n\n`). We handle both.
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  // SSE — find the first `data: …` line and parse it as JSON.
  const match = /^data: (.+)$/m.exec(text);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

interface ListToolsResult {
  tools: Tool[];
}

export async function listMcpTools(force = false): Promise<Tool[]> {
  if (!force && toolsCache) return toolsCache;
  const result = await rpc<ListToolsResult>("tools/list");
  toolsCache = result.tools;
  logger.info({ count: toolsCache.length }, "Cached MCP tools");
  return toolsCache;
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  return rpc<CallToolResult>("tools/call", { name, arguments: args });
}

export async function pingMcpServer(): Promise<{ tools: number }> {
  const tools = await listMcpTools(true);
  return { tools: tools.length };
}

export function clearToolsCache(): void {
  toolsCache = undefined;
}
