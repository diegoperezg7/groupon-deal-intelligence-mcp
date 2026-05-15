import { Command } from "commander";
import { DealStore, getDealDetails } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { formatJson } from "../format/index.js";

export function buildDealCommand(): Command {
  return new Command("deal")
    .description("Show details for one deal by id or URL")
    .argument("<id-or-url>")
    .action(async (idOrUrl: string) => {
      const cfg = loadConfig();
      const store = new DealStore(cfg.SQLITE_PATH);
      try {
        const result = getDealDetails(store, idOrUrl);
        if (!result) {
          process.stderr.write(`Deal not found: ${idOrUrl}\n`);
          process.exit(2);
        }
        process.stdout.write(formatJson(result) + "\n");
      } finally {
        store.close();
      }
    });
}
