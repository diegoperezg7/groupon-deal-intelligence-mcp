import type { DealStore } from "./store/index.js";
import { resolveDeal } from "./details.js";
import type { SearchResult } from "./types/deal.js";

/**
 * Find deals semantically similar to a reference deal. We re-use the
 * stored embedding of the reference (no re-embedding round-trip).
 */
export function findSimilarDeals(
  store: DealStore,
  refIdOrUrl: string,
  options: {
    limit?: number;
    excludeSelf?: boolean;
    categorySlug?: string;
    locationSlug?: string;
  } = {},
): { reference: SearchResult; similar: SearchResult[] } | null {
  const reference = resolveDeal(store, refIdOrUrl);
  if (!reference) return null;

  const embedding = store.getEmbedding(reference.id);
  if (!embedding) {
    // Reference exists but has no embedding (e.g. ingest failed mid-way)
    return {
      reference: { ...reference, similarity: 1 },
      similar: [],
    };
  }

  const wide = store.searchByEmbedding(embedding, {
    limit: (options.limit ?? 5) + (options.excludeSelf !== false ? 1 : 0),
    categorySlug: options.categorySlug,
    locationSlug: options.locationSlug,
  });
  const similar = options.excludeSelf !== false
    ? wide.filter((d) => d.id !== reference.id).slice(0, options.limit ?? 5)
    : wide.slice(0, options.limit ?? 5);

  return {
    reference: { ...reference, similarity: 1 },
    similar,
  };
}
