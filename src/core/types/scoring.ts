import { z } from "zod";

/**
 * Deterministic deal-attractiveness scoring. Inputs are the same fields
 * we have in the store; output is a 0..100 score plus a breakdown so the
 * LLM can explain WHY a deal scored as it did.
 */

export const ScoringWeightsSchema = z.object({
  discount: z.number().min(0).max(1).default(0.35),
  rating: z.number().min(0).max(1).default(0.3),
  popularity: z.number().min(0).max(1).default(0.2),
  price: z.number().min(0).max(1).default(0.15),
});
export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

export const DEFAULT_WEIGHTS: ScoringWeights = {
  discount: 0.35,
  rating: 0.3,
  popularity: 0.2,
  price: 0.15,
};

export const ScoreBreakdownSchema = z.object({
  discount: z.number(),
  rating: z.number(),
  popularity: z.number(),
  price: z.number(),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;
