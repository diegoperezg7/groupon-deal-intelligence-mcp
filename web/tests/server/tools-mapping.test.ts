import { describe, it, expect } from "vitest";
import { mcpToolToOpenAI, mcpToolsToOpenAI, buildSystemPrompt } from "../../server/tools";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

describe("mcpToolToOpenAI", () => {
  it("preserves the tool name and description", () => {
    const tool: Tool = {
      name: "search_deals",
      description: "Semantic + filtered search.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    };
    const out = mcpToolToOpenAI(tool);
    expect(out.type).toBe("function");
    expect(out.function.name).toBe("search_deals");
    expect(out.function.description).toContain("Semantic");
    expect(out.function.parameters).toMatchObject({
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    });
  });

  it("normalises a missing-input-schema tool to an empty object schema", () => {
    const tool: Tool = {
      name: "list_categories",
      description: "List every category.",
      // Some MCP servers ship without an inputSchema for zero-arg tools;
      // OpenAI tool API doesn't accept that — must be an object schema.
      inputSchema: undefined as unknown as Tool["inputSchema"],
    };
    const out = mcpToolToOpenAI(tool);
    expect(out.function.parameters).toEqual({ type: "object", properties: {} });
  });

  it("fills missing description with a reasonable default", () => {
    const tool: Tool = {
      name: "foo",
      inputSchema: { type: "object" },
    } as unknown as Tool;
    const out = mcpToolToOpenAI(tool);
    expect(out.function.description).toBe("Invoke the foo tool.");
  });

  it("maps an array of tools", () => {
    const tools: Tool[] = [
      { name: "a", description: "A.", inputSchema: { type: "object" } },
      { name: "b", description: "B.", inputSchema: { type: "object" } },
    ];
    const out = mcpToolsToOpenAI(tools);
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.function.name)).toEqual(["a", "b"]);
  });
});

describe("buildSystemPrompt", () => {
  it("mentions the tool names so the model knows what's available", () => {
    const prompt = buildSystemPrompt(["search_deals", "analyze_market"]);
    expect(prompt).toContain("search_deals");
    expect(prompt).toContain("analyze_market");
    expect(prompt).toContain("groupon.es");
  });

  it("instructs the model to invoke tools rather than invent", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt.toLowerCase()).toContain("invoke");
    expect(prompt.toLowerCase()).toContain("tool");
  });
});
