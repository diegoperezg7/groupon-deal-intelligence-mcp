import { Command } from "commander";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

/**
 * `groupon-intel ingest` is a thin wrapper that delegates to the Python
 * ingestion CLI. We do not re-implement the pipeline in TypeScript —
 * Scrapling is Python-only and that's by design.
 */
export function buildIngestCommand(): Command {
  return new Command("ingest")
    .description("Run the Scrapling-based Python ingestion pipeline (full scrape + embed + load).")
    .option("--max <n>", "max deals per listing", "10")
    .option("--kinds <list>", "comma-separated listing kinds (city,category,all)", "all")
    .option("--slugs <list>", "comma-separated listing slugs or 'all'", "all")
    .option("--provider <name>", "embeddings provider (openai | ollama)", "openai")
    .option(
      "--ingestion-dir <path>",
      "path to the ingestion/ package",
      resolve(process.cwd(), "ingestion"),
    )
    .action(async (opts) => {
      const venvPython = resolve(opts.ingestionDir, ".venv/bin/python");
      const python = existsSync(venvPython) ? venvPython : "python";

      const args = [
        "-m",
        "groupon_ingest",
        "ingest",
        "--max",
        String(opts.max),
        "--kinds",
        String(opts.kinds),
        "--slugs",
        String(opts.slugs),
        "--provider",
        String(opts.provider),
      ];

      process.stderr.write(
        `Running: ${python} ${args.join(" ")} (cwd=${opts.ingestionDir})\n`,
      );

      await new Promise<void>((res, rej) => {
        const child = spawn(python, args, {
          cwd: opts.ingestionDir,
          stdio: "inherit",
          env: process.env,
        });
        child.on("error", rej);
        child.on("exit", (code) =>
          code === 0 ? res() : rej(new Error(`Python ingest exited with code ${code}`)),
        );
      });
    });
}
