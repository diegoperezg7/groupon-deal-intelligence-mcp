import { Command } from "commander";
import { DealStore } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { detectDefaultFormat, emit, type OutputFormat, type TableColumn } from "../format/index.js";

export function buildCategoriesCommand(): Command {
  return new Command("categories")
    .description("List every category present in the catalogue")
    .option("-f, --format <fmt>", "json | table | markdown", (v) => v as OutputFormat)
    .action(async (opts) => {
      const cfg = loadConfig();
      const store = new DealStore(cfg.SQLITE_PATH);
      try {
        const categories = store.listCategories();
        const columns: TableColumn<(typeof categories)[number]>[] = [
          { header: "Slug", accessor: (c) => c.slug, maxWidth: 32 },
          { header: "Name", accessor: (c) => c.name, maxWidth: 40 },
          { header: "Deals", accessor: (c) => c.dealCount, align: "right" },
        ];
        emit(opts.format ?? detectDefaultFormat(), categories, columns);
      } finally {
        store.close();
      }
    });
}
