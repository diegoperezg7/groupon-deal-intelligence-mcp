import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Convert an MCP tool definition into the OpenAI Chat Completions
 * `tools[]` entry shape (also accepted verbatim by xAI Grok and any
 * other OpenAI-compatible endpoint).
 *
 * Two pitfalls the LLM-side requires us to handle:
 *   1. JSON Schema with `type: "object"` and no `properties` (some MCP
 *      tools take no args) makes some providers complain — we coerce
 *      to `{ type: "object", properties: {} }`.
 *   2. The description field on the OpenAI tool entry is what drives
 *      tool selection. We pass the MCP `description` verbatim; the MCP
 *      tool author already wrote it for an LLM audience.
 */

export interface OpenAIToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function mcpToolToOpenAI(tool: Tool): OpenAIToolDef {
  const inputSchema = tool.inputSchema as Record<string, unknown> | undefined;

  // Defensive normalisation: ensure parameters is an object schema.
  let parameters: Record<string, unknown>;
  if (!inputSchema || typeof inputSchema !== "object") {
    parameters = { type: "object", properties: {} };
  } else {
    parameters = { ...inputSchema };
    if (!("type" in parameters)) parameters.type = "object";
    if (!("properties" in parameters)) parameters.properties = {};
  }

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? `Invoke the ${tool.name} tool.`,
      parameters,
    },
  };
}

export function mcpToolsToOpenAI(tools: Tool[]): OpenAIToolDef[] {
  return tools.map(mcpToolToOpenAI);
}

/**
 * Build a short, scoped system prompt that anchors the assistant to
 * groupon.es deals and instructs it to invoke MCP tools rather than
 * hallucinate.
 */
export function buildSystemPrompt(toolNames: string[]): string {
  return [
    "You are a deal-intelligence assistant for groupon.es, the Spanish",
    "Groupon marketplace. You answer questions about deals, ofertas,",
    "descuentos, merchants and pricing across Spanish cities (Madrid,",
    "Barcelona, Valencia, Sevilla, Bilbao, Malaga, Zaragoza and others).",
    "",
    "Always invoke the available MCP tools rather than inventing data.",
    "Prices are in EUR. Most descriptions are Spanish — quote them when",
    "relevant. The data is a snapshot, not live: you cannot book, reserve",
    "or check real-time availability.",
    "",
    `Tools available: ${toolNames.join(", ")}.`,
    "",
    "Style: concise, friendly, English replies unless the user writes in",
    "Spanish. When you mention a deal, include its id and price so the",
    "user can spot it. When the user asks for analysis, lead with the",
    "headline number then the breakdown.",
  ].join("\n");
}
