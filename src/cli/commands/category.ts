import { Command } from "commander";
import { DealStore, getCategoryInsights } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { formatJson } from "../format/index.js";

export function buildCategoryCommand(): Command {
  return new Command("category")
    .description("Cross-location insights for a single category")
    .argument("<slug>")
    .action(async (slug: string) => {
      const cfg = loadConfig();
      const store = new DealStore(cfg.SQLITE_PATH);
      try {
        const result = getCategoryInsights(store, slug);
        process.stdout.write(formatJson(result) + "\n");
      } finally {
        store.close();
      }
    });
}
