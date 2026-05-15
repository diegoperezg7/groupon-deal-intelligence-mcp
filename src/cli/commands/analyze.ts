import { Command } from "commander";
import { DealStore, analyzeMarket } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { formatJson } from "../format/index.js";

export function buildAnalyzeCommand(): Command {
  return new Command("analyze")
    .description("Merchant-side market analysis for one (category, location) pair")
    .requiredOption("-c, --category <slug>", "category slug")
    .requiredOption("-l, --location <slug>", "location slug")
    .action(async (opts) => {
      const cfg = loadConfig();
      const store = new DealStore(cfg.SQLITE_PATH);
      try {
        const result = analyzeMarket(store, {
          categorySlug: opts.category,
          locationSlug: opts.location,
        });
        process.stdout.write(formatJson(result) + "\n");
      } finally {
        store.close();
      }
    });
}
