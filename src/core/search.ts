import type { DealStore } from "./store/index.js";
import type { EmbeddingsProvider } from "./embeddings/index.js";
import type { SearchResult } from "./types/deal.js";

export interface SearchOptions {
  query: string;
  locationSlug?: string;
  categorySlug?: string;
  maxPriceCents?: number;
  minRating?: number;
  limit?: number;
}

/**
 * Semantic + filtered deal search.
 *
 * The query is embedded then KNN-searched against the deal_vectors
 * virtual table; filters are AND-ed at the SQL level. We pass a wider
 * K than requested down to the store so post-filtering leaves room
 * for the requested limit.
 *
 * If the query is empty, we fall back to a deterministic listing
 * (best discount, then rating). That way an MCP client can call the
 * tool with no query and still get something useful.
 */
export async function searchDeals(
  deps: { store: DealStore; embeddings: EmbeddingsProvider },
  options: SearchOptions,
): Promise<SearchResult[]> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));

  if (!options.query?.trim()) {
    return deps.store
      .listDeals({
        locationSlug: options.locationSlug,
        categorySlug: options.categorySlug,
        maxPriceCents: options.maxPriceCents,
        minRating: options.minRating,
        limit,
      })
      .map((d) => ({ ...d, similarity: 1 })); // synthetic top similarity
  }

  const embedding = await deps.embeddings.embed(options.query.trim());

  return deps.store.searchByEmbedding(embedding, {
    limit,
    locationSlug: options.locationSlug,
    categorySlug: options.categorySlug,
    maxPriceCents: options.maxPriceCents,
    minRating: options.minRating,
  });
}
