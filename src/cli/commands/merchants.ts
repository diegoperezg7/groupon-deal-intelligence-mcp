import { Command } from "commander";
import { DealStore } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { detectDefaultFormat, emit, type OutputFormat, type TableColumn } from "../format/index.js";

export function buildMerchantsCommand(): Command {
  return new Command("merchants")
    .description("List merchants in the catalogue with deal count and average rating")
    .option("-n, --limit <n>", "max merchants to return (1..500)", (v) => parseInt(v, 10), 100)
    .option(
      "-s, --sort <key>",
      "sort key: dealCount (default) | rating | name",
      (v) => v as "dealCount" | "rating" | "name",
      "dealCount" as const,
    )
    .option("-f, --format <fmt>", "json | table | markdown", (v) => v as OutputFormat)
    .action(async (opts) => {
      const cfg = loadConfig();
      const store = new DealStore(cfg.SQLITE_PATH);
      try {
        const merchants = store.listMerchants({ limit: opts.limit, sort: opts.sort });
        const columns: TableColumn<(typeof merchants)[number]>[] = [
          { header: "ID", accessor: (m) => m.id, maxWidth: 40 },
          { header: "Name", accessor: (m) => m.name, maxWidth: 40 },
          {
            header: "★",
            accessor: (m) => (m.ratingAvg !== null ? m.ratingAvg.toFixed(2) : null),
            align: "right",
          },
          { header: "Deals", accessor: (m) => m.dealCount, align: "right" },
        ];
        emit(opts.format ?? detectDefaultFormat(), merchants, columns);
      } finally {
        store.close();
      }
    });
}
