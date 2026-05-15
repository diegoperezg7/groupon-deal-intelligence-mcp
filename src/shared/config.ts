import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

// Load .env from the repo root if it exists. We do this before parsing so
// the schema sees the values.
loadEnv({ path: resolve(process.cwd(), ".env") });

const ConfigSchema = z
  .object({
    EMBEDDINGS_PROVIDER: z.enum(["openai", "ollama"]).default("openai"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().optional(),
    OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    OLLAMA_HOST: z.string().url().default("http://localhost:11434"),
    OLLAMA_EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
    LLM_PROVIDER: z.enum(["openai", "openrouter", "ollama", "none"]).default("none"),
    LLM_MODEL: z.string().default("openai/gpt-4o-mini"),
    LLM_BASE_URL: z.string().url().optional(),
    SQLITE_PATH: z.string().default("./data/deals.sqlite"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
    MCP_HTTP_PORT: z.coerce.number().int().positive().default(3333),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.EMBEDDINGS_PROVIDER === "openai" && !cfg.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OPENAI_API_KEY is required when EMBEDDINGS_PROVIDER=openai",
        path: ["OPENAI_API_KEY"],
      });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

let _cached: Config | undefined;

export function loadConfig(): Config {
  if (_cached) return _cached;
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration error:\n${issues}`);
  }
  _cached = parsed.data;
  return _cached;
}

/** For tests — clears the memoized config so a new env can be parsed. */
export function resetConfig(): void {
  _cached = undefined;
}
