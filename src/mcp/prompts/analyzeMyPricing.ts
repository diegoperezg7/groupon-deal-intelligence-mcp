import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Slash-command prompt aimed at a merchant: "I sell X in Y at price Z.
 * How does my offer compare?". Returns a templated user message the
 * client surfaces, with placeholders pre-bound so the agent goes
 * straight to invoking analyze_market + compare_deals.
 */
export function registerAnalyzeMyPricing(server: McpServer): void {
  server.registerPrompt(
    "analyze_my_pricing",
    {
      title: "Analyse my pricing",
      description:
        "Merchant-side prompt that asks the model to position your offer in its (category, location) segment using analyze_market and compare_deals.",
      argsSchema: {
        category: z
          .string()
          .describe("Your category slug (e.g. 'belleza', 'bienestar', 'gastronomia')."),
        location: z
          .string()
          .describe("City slug (e.g. 'madrid', 'barcelona')."),
        myPriceEuros: z
          .string()
          .describe("Your price in EUR (numeric, e.g. '49.99')."),
        myDiscountPct: z
          .string()
          .optional()
          .describe("Your discount in percent (numeric, optional)."),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `I'm a Groupon merchant in category '${args.category}' selling in '${args.location}'. ` +
              `My current price is ${args.myPriceEuros}€` +
              (args.myDiscountPct ? ` with a ${args.myDiscountPct}% discount` : "") +
              `. Use analyze_market to position me against the segment, then identify 3 top performers I should benchmark against using compare_deals. ` +
              `Tell me where I sit, what's working in this segment's copy (titles + descriptions) and any underserved nearby locations I might expand to.`,
          },
        },
      ],
    }),
  );
}
