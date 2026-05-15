import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Locate the .env file robustly:
//   1. Current working directory (the user might be in the repo root)
//   2. Walk up from the location of this script (handles `npx`, global
//      installs and PATH-based invocations where cwd is unrelated)
// We do this BEFORE schema parsing so loaded values populate process.env.
const __thisFile = fileURLToPath(import.meta.url);
function findEnvFile(): string | undefined {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(dirname(__thisFile), ".env"),
    resolve(dirname(__thisFile), "..", ".env"),
    resolve(dirname(__thisFile), "..", "..", ".env"),
    resolve(dirname(__thisFile), "..", "..", "..", ".env"),
  ];
  return candidates.find((p) => existsSync(p));
}
const envPath = findEnvFile();
if (envPath) loadEnv({ path: envPath });

const ConfigSchema = z
  .object({
    EMBEDDINGS_PROVIDER: z.enum(["openai", "ollama"]).default("openai"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().optional(),
    OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    OLLAMA_HOST: z.string().url().default("http://localhost:11434"),
    OLLAMA_EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
    LLM_PROVIDER: z.enum(["openai", "openrouter", "xai", "ollama", "none"]).default("none"),
    LLM_API_KEY: z.string().optional(),
    LLM_MODEL: z.string().default("grok-4-1-fast-non-reasoning"),
    LLM_BASE_URL: z.string().url().default("https://api.x.ai/v1"),
    SQLITE_PATH: z.string().default("./data/deals.sqlite"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
    MCP_HTTP_PORT: z.coerce.number().int().positive().default(3333),
    // --- Web subproject (BFF + frontend) ---
    WEB_PORT: z.coerce.number().int().positive().default(3000),
    MCP_URL: z.string().url().default("http://localhost:3333/mcp"),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.EMBEDDINGS_PROVIDER === "openai" && !cfg.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OPENAI_API_KEY is required when EMBEDDINGS_PROVIDER=openai",
        path: ["OPENAI_API_KEY"],
      });
    }
    // NOTE: LLM_API_KEY is NOT required at the root-config level. The MCP
    // server and CLI don't invoke an LLM — only the web BFF does, and it
    // re-validates with its own (stricter) schema in web/server/config.ts.
    // We let the root config load fine when the LLM key is blank.
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
