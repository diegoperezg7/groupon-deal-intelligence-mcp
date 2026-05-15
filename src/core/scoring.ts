import type { Deal, ScoredDeal } from "./types/deal.js";
import { DEFAULT_WEIGHTS, type ScoringWeights } from "./types/scoring.js";

/**
 * Score a deal's "attractiveness" deterministically on a 0..100 scale.
 *
 * No LLM involved — this is product logic. Each component is normalised
 * to 0..100 then combined with weights. A breakdown is returned so the
 * caller (the LLM, in MCP-land) can explain the score to a user.
 *
 * Components:
 * - discount    : 100 = 80%+ off, linearly down to 0 at no discount
 * - rating      : 100 = 5.0, linearly down to 0 at 0
 * - popularity  : log-scaled review count, 100 at 500+ reviews
 * - price       : 100 if priceCents <= peerMedian, 50 if priceCents <= 2x median, 0 otherwise
 *
 * The price component requires a `peerMedianCents` to be meaningful;
 * without it we drop the price weight and renormalise.
 */
export function scoreDeal(
  deal: Deal,
  context: { peerMedianCents?: number; weights?: Partial<ScoringWeights> } = {},
): ScoredDeal {
  const weights: ScoringWeights = { ...DEFAULT_WEIGHTS, ...context.weights };

  const discount = scoreDiscount(deal.discountPct);
  const rating = scoreRating(deal.rating);
  const popularity = scorePopularity(deal.reviewsCount);
  const price =
    context.peerMedianCents !== undefined
      ? scorePrice(deal.priceCents, context.peerMedianCents)
      : null;

  // If price isn't scorable, renormalise the other weights to sum to 1
  const effectiveWeights = price === null
    ? renormaliseWithoutPrice(weights)
    : weights;

  const composite =
    discount * effectiveWeights.discount +
    rating * effectiveWeights.rating +
    popularity * effectiveWeights.popularity +
    (price ?? 0) * effectiveWeights.price;

  return {
    ...deal,
    score: Math.round(Math.max(0, Math.min(100, composite))),
    scoreBreakdown: {
      discount,
      rating,
      popularity,
      price: price ?? 0,
    },
  };
}

export function scoreDiscount(discountPct: number | null): number {
  if (discountPct === null || discountPct < 0) return 0;
  // 0% → 0, 80%+ → 100, linear in between
  return Math.min(100, (discountPct / 80) * 100);
}

export function scoreRating(rating: number | null): number {
  if (rating === null || rating < 0) return 0;
  return Math.min(100, (rating / 5) * 100);
}

export function scorePopularity(reviewsCount: number | null): number {
  if (reviewsCount === null || reviewsCount <= 0) return 0;
  // log10(reviews+1) scaled so 500 reviews → ~100
  const scaled = (Math.log10(reviewsCount + 1) / Math.log10(501)) * 100;
  return Math.min(100, scaled);
}

export function scorePrice(
  priceCents: number | null,
  peerMedianCents: number,
): number {
  if (priceCents === null || peerMedianCents <= 0) return 0;
  if (priceCents <= peerMedianCents) return 100;
  if (priceCents <= peerMedianCents * 2) {
    // linear between median (100) and 2× median (50)
    const ratio = (priceCents - peerMedianCents) / peerMedianCents;
    return 100 - ratio * 50;
  }
  return Math.max(0, 50 - (priceCents / peerMedianCents - 2) * 25);
}

function renormaliseWithoutPrice(w: ScoringWeights): ScoringWeights {
  const remaining = w.discount + w.rating + w.popularity;
  if (remaining === 0) return w;
  return {
    discount: w.discount / remaining,
    rating: w.rating / remaining,
    popularity: w.popularity / remaining,
    price: 0,
  };
}
