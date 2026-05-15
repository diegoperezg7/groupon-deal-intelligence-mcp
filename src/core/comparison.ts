import type { DealStore } from "./store/index.js";
import { resolveDeal } from "./details.js";
import { scoreDeal } from "./scoring.js";
import type { ScoredDeal } from "./types/deal.js";

/**
 * Compare 2 or more deals side-by-side, with the same attractiveness
 * score applied to all so the agent can rank them. We compute a peer
 * median price across the set as the price baseline — comparisons are
 * relative to the cohort being compared, not the whole catalogue.
 */
export function compareDeals(
  store: DealStore,
  idsOrUrls: string[],
): { deals: ScoredDeal[]; missing: string[] } {
  const resolved = idsOrUrls.map((id) => ({ key: id, deal: resolveDeal(store, id) }));
  const found = resolved.filter((r) => r.deal !== null) as {
    key: string;
    deal: NonNullable<ReturnType<typeof resolveDeal>>;
  }[];
  const missing = resolved.filter((r) => r.deal === null).map((r) => r.key);

  const peerMedianCents = medianCents(found.map((r) => r.deal.priceCents));
  const scored = found.map((r) => scoreDeal(r.deal, { peerMedianCents }));

  // Sort descending by score, stable
  scored.sort((a, b) => b.score - a.score);

  return { deals: scored, missing };
}

function medianCents(values: (number | null)[]): number {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}
