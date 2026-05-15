import { loadConfig } from "../../shared/config.js";
import { OpenAIEmbeddingsProvider } from "./openai.js";
import { OllamaEmbeddingsProvider } from "./ollama.js";

export interface EmbeddingsProvider {
  readonly name: string;
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

let _cached: EmbeddingsProvider | undefined;

/**
 * Resolve the embeddings provider from current configuration.
 * Cached for the lifetime of the process; call `resetEmbeddingsProvider`
 * in tests to swap.
 */
export function getEmbeddingsProvider(): EmbeddingsProvider {
  if (_cached) return _cached;
  const cfg = loadConfig();
  if (cfg.EMBEDDINGS_PROVIDER === "openai") {
    _cached = new OpenAIEmbeddingsProvider({
      apiKey: cfg.OPENAI_API_KEY ?? "",
      baseUrl: cfg.OPENAI_BASE_URL,
      model: cfg.OPENAI_EMBEDDING_MODEL,
    });
  } else {
    _cached = new OllamaEmbeddingsProvider({
      host: cfg.OLLAMA_HOST,
      model: cfg.OLLAMA_EMBEDDING_MODEL,
    });
  }
  return _cached;
}

export function resetEmbeddingsProvider(): void {
  _cached = undefined;
}

export { OpenAIEmbeddingsProvider, OllamaEmbeddingsProvider };
