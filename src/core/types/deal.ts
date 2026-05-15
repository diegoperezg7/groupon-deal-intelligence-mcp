import { z } from "zod";

/**
 * Domain types for the intelligence layer. Shared by MCP tools, CLI
 * commands and (eventually) any HTTP wrapper. Always match the SQLite
 * schema in src/core/store/schema.sql.
 */

export const DealSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  description: z.string().nullable(),
  merchantId: z.string().nullable(),
  merchantName: z.string().nullable(),
  categorySlug: z.string(),
  locationSlug: z.string(),
  priceCents: z.number().int().nonnegative().nullable(),
  originalPriceCents: z.number().int().nonnegative().nullable(),
  discountPct: z.number().int().min(0).max(100).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  reviewsCount: z.number().int().nonnegative().nullable(),
  imageUrl: z.string().url().nullable(),
  scrapedAt: z.string(), // ISO 8601
});
export type Deal = z.infer<typeof DealSchema>;

export const CategorySchema = z.object({
  slug: z.string(),
  name: z.string(),
  dealCount: z.number().int().nonnegative(),
});
export type Category = z.infer<typeof CategorySchema>;

export const LocationSchema = z.object({
  slug: z.string(),
  name: z.string(),
  dealCount: z.number().int().nonnegative(),
});
export type Location = z.infer<typeof LocationSchema>;

export const MerchantSchema = z.object({
  id: z.string(),
  name: z.string(),
  ratingAvg: z.number().min(0).max(5).nullable(),
  dealCount: z.number().int().nonnegative(),
});
export type Merchant = z.infer<typeof MerchantSchema>;

/** A deal enriched with its computed attractiveness score. */
export const ScoredDealSchema = DealSchema.extend({
  score: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    price: z.number(),
    discount: z.number(),
    rating: z.number(),
    popularity: z.number(),
  }),
});
export type ScoredDeal = z.infer<typeof ScoredDealSchema>;

/** A deal returned by semantic search, with its similarity distance. */
export const SearchResultSchema = DealSchema.extend({
  similarity: z.number().min(0).max(1),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;
