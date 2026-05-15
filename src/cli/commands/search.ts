import { Command } from "commander";
import { DealStore, getEmbeddingsProvider, searchDeals } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { detectDefaultFormat, emit, type OutputFormat, type TableColumn } from "../format/index.js";

export function buildSearchCommand(): Command {
  return new Command("search")
    .description("Semantic search across the deal catalogue")
    .argument("[query...]", "natural-language query")
    .option("-l, --location <slug>", "filter by city slug")
    .option("-c, --category <slug>", "filter by category slug")
    .option("--max-price <eur>", "max price in EUR", parseFloat)
    .option("--min-rating <r>", "minimum rating (0..5)", parseFloat)
    .option("-n, --limit <n>", "max results", (v) => parseInt(v, 10), 10)
    .option(
      "-f, --format <fmt>",
      "output format: json | table | markdown",
      (v) => v as OutputFormat,
    )
    .action(async (queryWords: string[], opts) => {
      const cfg = loadConfig();
      const store = new DealStore(cfg.SQLITE_PATH);
      const embeddings = getEmbeddingsProvider();
      const query = queryWords.join(" ").trim();

      try {
        const results = await searchDeals(
          { store, embeddings },
          {
            query,
            locationSlug: opts.location,
            categorySlug: opts.category,
            maxPriceCents:
              opts.maxPrice !== undefined ? Math.round(opts.maxPrice * 100) : undefined,
            minRating: opts.minRating,
            limit: opts.limit,
          },
        );

        const columns: TableColumn<(typeof results)[number]>[] = [
          { header: "ID", accessor: (r) => r.id, maxWidth: 32 },
          { header: "Title", accessor: (r) => r.title, maxWidth: 50 },
          { header: "City", accessor: (r) => r.locationSlug },
          { header: "Cat", accessor: (r) => r.categorySlug },
          {
            header: "€",
            accessor: (r) => (r.priceCents !== null ? (r.priceCents / 100).toFixed(2) : null),
            align: "right",
          },
          {
            header: "%",
            accessor: (r) => (r.discountPct !== null ? `${r.discountPct}%` : null),
            align: "right",
          },
          {
            header: "★",
            accessor: (r) => (r.rating !== null ? r.rating.toFixed(1) : null),
            align: "right",
          },
          {
            header: "sim",
            accessor: (r) => r.similarity.toFixed(3),
            align: "right",
          },
        ];

        const format = opts.format ?? detectDefaultFormat();
        emit(format, results, columns, { query, count: results.length, results });
      } finally {
        store.close();
      }
    });
}
