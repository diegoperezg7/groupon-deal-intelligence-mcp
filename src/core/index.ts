/**
 * Public barrel for the intelligence core. Consumers (MCP server, CLI,
 * future HTTP wrapper) import only from here.
 */

export { DealStore } from "./store/index.js";
export {
  getEmbeddingsProvider,
  resetEmbeddingsProvider,
  OpenAIEmbeddingsProvider,
  OllamaEmbeddingsProvider,
  type EmbeddingsProvider,
} from "./embeddings/index.js";

export { searchDeals, type SearchOptions } from "./search.js";
export { resolveDeal, getDealDetails, type DealDetails } from "./details.js";
export { findSimilarDeals } from "./similarity.js";
export { compareDeals } from "./comparison.js";
export {
  analyzeMarket,
  computePriceStats,
  computeDiscountDistribution,
  extractCopyPatterns,
  detectUnderservedSubsegments,
} from "./market.js";
export { getCategoryInsights } from "./category.js";
export { buildCatalogOverview } from "./overview.js";
export {
  scoreDeal,
  scoreDiscount,
  scoreRating,
  scorePopularity,
  scorePrice,
} from "./scoring.js";

export * from "./types/deal.js";
export * from "./types/market.js";
export * from "./types/scoring.js";
export * from "./types/overview.js";
