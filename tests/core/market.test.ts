import { describe, it, expect } from "vitest";
import {
  computePriceStats,
  computeDiscountDistribution,
  extractCopyPatterns,
} from "../../src/core/market.js";
import type { Deal } from "../../src/core/types/deal.js";

function deal(overrides: Partial<Deal> & { id: string }): Deal {
  return {
    url: `https://www.groupon.es/deals/${overrides.id}`,
    title: "Generic title",
    description: null,
    merchantId: null,
    merchantName: null,
    categorySlug: "bienestar",
    locationSlug: "madrid",
    priceCents: 5000,
    originalPriceCents: 10000,
    discountPct: 50,
    rating: 4,
    reviewsCount: 50,
    imageUrl: null,
    scrapedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computePriceStats", () => {
  it("handles empty input safely", () => {
    const stats = computePriceStats([]);
    expect(stats.count).toBe(0);
    expect(stats.median).toBeNull();
  });

  it("computes statistics in euros (not cents)", () => {
    const deals = [10_00, 20_00, 30_00, 40_00, 50_00].map((p, i) =>
      deal({ id: `d-${i}`, priceCents: p }),
    );
    const stats = computePriceStats(deals);
    expect(stats.count).toBe(5);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(50);
    expect(stats.median).toBe(30);
    expect(stats.mean).toBe(30);
  });
});

describe("computeDiscountDistribution", () => {
  it("buckets discounts correctly", () => {
    const deals = [10, 30, 45, 50, 75, 90].map((d, i) =>
      deal({ id: `d-${i}`, discountPct: d }),
    );
    const dist = computeDiscountDistribution(deals);
    expect(dist.buckets.find((b) => b.range === "0-20%")?.count).toBe(1);
    expect(dist.buckets.find((b) => b.range === "20-40%")?.count).toBe(1);
    expect(dist.buckets.find((b) => b.range === "40-60%")?.count).toBe(2);
    expect(dist.buckets.find((b) => b.range === "60-80%")?.count).toBe(1);
    expect(dist.buckets.find((b) => b.range === "80-100%")?.count).toBe(1);
  });

  it("returns null mean/median when empty", () => {
    const dist = computeDiscountDistribution([
      deal({ id: "x", discountPct: null }),
    ]);
    expect(dist.mean).toBeNull();
    expect(dist.median).toBeNull();
  });
});

describe("extractCopyPatterns", () => {
  it("returns tokens that appear in >= 10% of titles (min 2)", () => {
    const deals = [
      "Masaje relajante en pareja",
      "Masaje relajante con cava",
      "Masaje exprés de espalda",
      "Tratamiento facial completo",
      "Tratamiento corporal exfoliante",
      "Tratamiento de chocolaterapia",
      "Tratamiento de hidroterapia",
      "Tratamiento de aromaterapia",
      "Tratamiento de drenaje linfático",
      "Tratamiento facial premium",
    ].map((t, i) => deal({ id: `t-${i}`, title: t }));

    const patterns = extractCopyPatterns(deals);
    const tokens = patterns.map((p) => p.token);
    expect(tokens).toContain("tratamiento");
    expect(tokens).toContain("masaje");
    // Stop words should not appear
    expect(tokens).not.toContain("de");
    expect(tokens).not.toContain("en");
  });
});
