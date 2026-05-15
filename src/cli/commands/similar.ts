import { Command } from "commander";
import { DealStore, findSimilarDeals } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { detectDefaultFormat, emit, type OutputFormat, type TableColumn } from "../format/index.js";

export function buildSimilarCommand(): Command {
  return new Command("similar")
    .description("Find deals semantically similar to a reference deal")
    .argument("<id-or-url>")
    .option("-n, --limit <n>", "max results", (v) => parseInt(v, 10), 5)
    .option("--same-category", "restrict to the same category as the reference")
    .option("--same-location", "restrict to the same location as the reference")
    .option("-f, --format <fmt>", "json | table | markdown", (v) => v as OutputFormat)
    .action(async (idOrUrl: string, opts) => {
      const cfg = loadConfig();
      const store = new DealStore(cfg.SQLITE_PATH);
      try {
        const ref = store.getDealById(idOrUrl) ?? store.getDealByUrl(idOrUrl);
        const result = findSimilarDeals(store, idOrUrl, {
          limit: opts.limit,
          excludeSelf: true,
          categorySlug: opts.sameCategory && ref ? ref.categorySlug : undefined,
          locationSlug: opts.sameLocation && ref ? ref.locationSlug : undefined,
        });
        if (!result) {
          process.stderr.write(`Deal not found: ${idOrUrl}\n`);
          process.exit(2);
        }
        const columns: TableColumn<(typeof result.similar)[number]>[] = [
          { header: "ID", accessor: (r) => r.id, maxWidth: 32 },
          { header: "Title", accessor: (r) => r.title, maxWidth: 50 },
          { header: "City", accessor: (r) => r.locationSlug },
          { header: "Cat", accessor: (r) => r.categorySlug },
          {
            header: "€",
            accessor: (r) => (r.priceCents !== null ? (r.priceCents / 100).toFixed(2) : null),
            align: "right",
          },
          { header: "sim", accessor: (r) => r.similarity.toFixed(3), align: "right" },
        ];
        const format = opts.format ?? detectDefaultFormat();
        emit(format, result.similar, columns, {
          reference: { id: result.reference.id, title: result.reference.title },
          similar: result.similar,
        });
      } finally {
        store.close();
      }
    });
}
