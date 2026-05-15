import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Prompt aimed at an internal analyst: find deals where the offer is
 * objectively strong (big discount, high rating) but the segment is
 * underexplored — opportunities to cross-promote or amplify.
 */
export function registerFindArbitrage(server: McpServer): void {
  server.registerPrompt(
    "find_arbitrage",
    {
      title: "Find arbitrage opportunities",
      description:
        "Analyst-side prompt: surface deals whose attractiveness is high but whose category/location segment is underserved.",
      argsSchema: {
        location: z
          .string()
          .optional()
          .describe("Limit to a single city (optional)."),
        minRating: z
          .string()
          .optional()
          .describe("Minimum rating to consider (0..5, defaults to 4)."),
        minDiscountPct: z
          .string()
          .optional()
          .describe("Minimum discount % to consider (defaults to 40)."),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Surface arbitrage opportunities on Groupon.es: deals with discount >= ${args.minDiscountPct ?? "40"}% ` +
              `and rating >= ${args.minRating ?? "4"} ` +
              (args.location ? `in ${args.location} ` : "") +
              `that sit in segments with relatively thin competition. ` +
              `Use search_deals to find the strong offers, list_categories + category_insights to spot thin segments, and finish with 3 to 5 concrete recommendations of deals to amplify and why.`,
          },
        },
      ],
    }),
  );
}
