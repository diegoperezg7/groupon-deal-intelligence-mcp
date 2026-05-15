import OpenAI from "openai";
import { EmbeddingProviderError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import type { EmbeddingsProvider } from "./index.js";

const STORAGE_DIM = 1536; // matches sqlite-vec schema in schema.sql

/**
 * Embeddings via any OpenAI-compatible endpoint.
 *
 * Default model: `text-embedding-3-small` (1536d, $0.02 per 1M tokens).
 * When pointing to OpenRouter, model names need the provider prefix:
 *   openai/text-embedding-3-small
 *
 * Vectors are right-padded or truncated to STORAGE_DIM so the SQLite
 * schema stays fixed regardless of the underlying model dimension.
 */
export class OpenAIEmbeddingsProvider implements EmbeddingsProvider {
  readonly name = "openai";
  readonly dimension = STORAGE_DIM;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: { apiKey: string; baseUrl?: string; model: string }) {
    if (!opts.apiKey) {
      throw new Error("OpenAIEmbeddingsProvider requires an apiKey");
    }
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseUrl,
    });
    this.model = opts.model;
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedMany([text]);
    return vec;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
      });
      return response.data.map((d) => padOrTruncate(d.embedding, STORAGE_DIM));
    } catch (err) {
      logger.error({ err, model: this.model }, "Embedding request failed");
      throw new EmbeddingProviderError(this.name, err);
    }
  }
}

function padOrTruncate(vec: number[], targetDim: number): number[] {
  if (vec.length === targetDim) return vec;
  if (vec.length < targetDim) {
    return [...vec, ...new Array(targetDim - vec.length).fill(0)];
  }
  return vec.slice(0, targetDim);
}
