import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Prompt aimed at a shopper: "compare these N deals for me and pick
 * the best one for my situation". The args are deliberately string
 * (one comma-separated list) because MCP clients render args as flat
 * inputs and lists of strings are awkward to type.
 */
export function registerCompareDealsPrompt(server: McpServer): void {
  server.registerPrompt(
    "compare_deals",
    {
      title: "Compare deals for me",
      description:
        "Shopper-side prompt: pass 2-10 deal ids or URLs and let the model rank them with reasoning for each.",
      argsSchema: {
        idsOrUrls: z
          .string()
          .describe("Comma-separated list of 2-10 deal ids or URLs."),
        context: z
          .string()
          .optional()
          .describe("Optional context about the situation, e.g. 'romantic anniversary in Madrid, budget 80 EUR'."),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Compare these Groupon.es deals: ${args.idsOrUrls}. ` +
              (args.context
                ? `Context for the decision: ${args.context}. `
                : "") +
              `Use compare_deals to score them, then walk me through the ranking — what each one is good at, what concerns to raise, and which one you'd recommend and why.`,
          },
        },
      ],
    }),
  );
}
