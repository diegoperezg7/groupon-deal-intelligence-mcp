import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Mirrors src/shared/config.ts but parses only the keys the BFF needs.
// The single source of truth for environment is still the repo-root .env;
// we walk up from this file's location plus cwd to find it.
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

const WebConfigSchema = z
  .object({
    LLM_PROVIDER: z.enum(["openai", "openrouter", "xai", "ollama", "none"]).default("xai"),
    LLM_API_KEY: z.string().optional(),
    LLM_MODEL: z.string().default("grok-4-1-fast-non-reasoning"),
    LLM_BASE_URL: z.string().url().default("https://api.x.ai/v1"),

    WEB_PORT: z.coerce.number().int().positive().default(3000),
    MCP_URL: z.string().url().default("http://localhost:3333/mcp"),

    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    NODE_ENV: z.string().default("development"),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.LLM_PROVIDER !== "none" && cfg.LLM_PROVIDER !== "ollama" && !cfg.LLM_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `LLM_API_KEY is required when LLM_PROVIDER=${cfg.LLM_PROVIDER}`,
        path: ["LLM_API_KEY"],
      });
    }
  });

export type WebConfig = z.infer<typeof WebConfigSchema>;

let _cached: WebConfig | undefined;

export function loadWebConfig(): WebConfig {
  if (_cached) return _cached;
  const parsed = WebConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Web BFF configuration error:\n${issues}`);
  }
  _cached = parsed.data;
  return _cached;
}

export function resetWebConfig(): void {
  _cached = undefined;
}
