import { Command } from "commander";
import { DealStore, compareDeals } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { detectDefaultFormat, emit, type OutputFormat, type TableColumn } from "../format/index.js";

export function buildCompareCommand(): Command {
  return new Command("compare")
    .description("Score and rank 2 to 10 deals side-by-side")
    .argument("<ids...>", "2-10 deal ids or URLs")
    .option("-f, --format <fmt>", "json | table | markdown", (v) => v as OutputFormat)
    .action(async (idsOrUrls: string[], opts) => {
      if (idsOrUrls.length < 2) {
        process.stderr.write("Need at least 2 deals to compare.\n");
        process.exit(2);
      }
      const cfg = loadConfig();
      const store = new DealStore(cfg.SQLITE_PATH);
      try {
        const { deals, missing } = compareDeals(store, idsOrUrls);
        const ranking = deals.map((d, i) => ({
          rank: i + 1,
          id: d.id,
          title: d.title,
          merchant: d.merchantName,
          priceCents: d.priceCents,
          discountPct: d.discountPct,
          rating: d.rating,
          score: d.score,
        }));
        const columns: TableColumn<(typeof ranking)[number]>[] = [
          { header: "#", accessor: (r) => r.rank, align: "right" },
          { header: "ID", accessor: (r) => r.id, maxWidth: 32 },
          { header: "Title", accessor: (r) => r.title, maxWidth: 50 },
          { header: "Merch", accessor: (r) => r.merchant, maxWidth: 24 },
          {
            header: "€",
            accessor: (r) =>
              r.priceCents !== null ? (r.priceCents / 100).toFixed(2) : null,
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
          { header: "Score", accessor: (r) => r.score, align: "right" },
        ];
        const format = opts.format ?? detectDefaultFormat();
        emit(format, ranking, columns, { ranking, missing });
      } finally {
        store.close();
      }
    });
}
