import OpenAI from "openai";
import { loadWebConfig } from "./config.js";

let _client: OpenAI | undefined;

/**
 * Returns a singleton OpenAI client configured against whichever
 * OpenAI-compatible endpoint the operator chose. Default is xAI Grok.
 */
export function getLlmClient(): OpenAI {
  if (_client) return _client;
  const cfg = loadWebConfig();
  if (!cfg.LLM_API_KEY) {
    throw new Error(
      `LLM_API_KEY not set. LLM_PROVIDER=${cfg.LLM_PROVIDER}, LLM_BASE_URL=${cfg.LLM_BASE_URL}. ` +
        "Set the key in the repo-root .env (see web/.env.example).",
    );
  }
  _client = new OpenAI({
    apiKey: cfg.LLM_API_KEY,
    baseURL: cfg.LLM_BASE_URL,
  });
  return _client;
}

export function getLlmModel(): string {
  return loadWebConfig().LLM_MODEL;
}
