import { EmbeddingProviderError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import type { EmbeddingsProvider } from "./index.js";

const STORAGE_DIM = 1536;

/**
 * Local embeddings via Ollama. Sends one request per text — Ollama's
 * /api/embeddings doesn't batch as of writing. Slower than OpenAI but
 * free and on-prem.
 *
 * `nomic-embed-text` (768d) is the recommended default; we right-pad
 * vectors to STORAGE_DIM so they fit the same SQLite schema as OpenAI's.
 */
export class OllamaEmbeddingsProvider implements EmbeddingsProvider {
  readonly name = "ollama";
  readonly dimension = STORAGE_DIM;
  private readonly host: string;
  private readonly model: string;

  constructor(opts: { host: string; model: string }) {
    this.host = opts.host.replace(/\/$/, "");
    this.model = opts.model;
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.host}/api/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama returned ${response.status}: ${body}`);
      }
      const payload = (await response.json()) as { embedding: number[] };
      return padOrTruncate(payload.embedding, STORAGE_DIM);
    } catch (err) {
      logger.error({ err, model: this.model, host: this.host }, "Ollama embed failed");
      throw new EmbeddingProviderError(this.name, err);
    }
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const text of texts) {
      out.push(await this.embed(text));
    }
    return out;
  }
}

function padOrTruncate(vec: number[], targetDim: number): number[] {
  if (vec.length === targetDim) return vec;
  if (vec.length < targetDim) {
    return [...vec, ...new Array(targetDim - vec.length).fill(0)];
  }
  return vec.slice(0, targetDim);
}
