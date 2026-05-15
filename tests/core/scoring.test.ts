import { describe, it, expect } from "vitest";
import {
  scoreDeal,
  scoreDiscount,
  scoreRating,
  scorePopularity,
  scorePrice,
} from "../../src/core/scoring.js";
import type { Deal } from "../../src/core/types/deal.js";

function deal(overrides: Partial<Deal>): Deal {
  return {
    id: "test-deal",
    url: "https://www.groupon.es/deals/test-deal",
    title: "Test deal",
    description: null,
    merchantId: null,
    merchantName: null,
    categorySlug: "bienestar",
    locationSlug: "madrid",
    priceCents: 5000,
    originalPriceCents: 10000,
    discountPct: 50,
    rating: 4.5,
    reviewsCount: 100,
    imageUrl: null,
    scrapedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("scoreDiscount", () => {
  it("returns 0 for null or negative discount", () => {
    expect(scoreDiscount(null)).toBe(0);
    expect(scoreDiscount(-5)).toBe(0);
  });
  it("caps at 100 for 80% or above", () => {
    expect(scoreDiscount(80)).toBe(100);
    expect(scoreDiscount(95)).toBe(100);
  });
  it("interpolates linearly", () => {
    expect(scoreDiscount(40)).toBe(50);
  });
});

describe("scoreRating", () => {
  it("normalises 0..5 onto 0..100", () => {
    expect(scoreRating(0)).toBe(0);
    expect(scoreRating(5)).toBe(100);
    expect(scoreRating(4)).toBe(80);
  });
  it("handles null", () => {
    expect(scoreRating(null)).toBe(0);
  });
});

describe("scorePopularity", () => {
  it("is monotonic with review count", () => {
    const a = scorePopularity(10);
    const b = scorePopularity(100);
    const c = scorePopularity(500);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
  it("approaches 100 at 500 reviews", () => {
    expect(scorePopularity(500)).toBeGreaterThan(99);
  });
});

describe("scorePrice", () => {
  it("returns 100 when at or below the peer median", () => {
    expect(scorePrice(4000, 5000)).toBe(100);
    expect(scorePrice(5000, 5000)).toBe(100);
  });
  it("decreases linearly between median and 2x median", () => {
    expect(scorePrice(10000, 5000)).toBeCloseTo(50, 0);
    expect(scorePrice(7500, 5000)).toBeCloseTo(75, 0);
  });
});

describe("scoreDeal", () => {
  it("produces a 0..100 composite", () => {
    const result = scoreDeal(deal({}), { peerMedianCents: 5000 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("renormalises weights when no peer median is given", () => {
    const result = scoreDeal(deal({}));
    expect(result.score).toBeGreaterThan(0);
    expect(result.scoreBreakdown.price).toBe(0); // price component zeroed
  });

  it("ranks a clearly better deal higher than a worse one", () => {
    const great = deal({ discountPct: 75, rating: 5, reviewsCount: 400 });
    const poor = deal({ discountPct: 10, rating: 3, reviewsCount: 5 });
    const a = scoreDeal(great, { peerMedianCents: 5000 });
    const b = scoreDeal(poor, { peerMedianCents: 5000 });
    expect(a.score).toBeGreaterThan(b.score);
  });
});
