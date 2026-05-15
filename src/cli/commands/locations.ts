import { Command } from "commander";
import { DealStore } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { detectDefaultFormat, emit, type OutputFormat, type TableColumn } from "../format/index.js";

export function buildLocationsCommand(): Command {
  return new Command("locations")
    .description("List every location present in the catalogue")
    .option("-f, --format <fmt>", "json | table | markdown", (v) => v as OutputFormat)
    .action(async (opts) => {
      const cfg = loadConfig();
      const store = new DealStore(cfg.SQLITE_PATH);
      try {
        const locations = store.listLocations();
        const columns: TableColumn<(typeof locations)[number]>[] = [
          { header: "Slug", accessor: (l) => l.slug, maxWidth: 24 },
          { header: "Name", accessor: (l) => l.name, maxWidth: 24 },
          { header: "Deals", accessor: (l) => l.dealCount, align: "right" },
        ];
        emit(opts.format ?? detectDefaultFormat(), locations, columns);
      } finally {
        store.close();
      }
    });
}
