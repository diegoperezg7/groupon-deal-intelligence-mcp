import { Command } from "commander";
import { DealStore, analyzeMarket } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { detectDefaultFormat, formatJson, type OutputFormat } from "../format/index.js";

export function buildAnalyzeCommand(): Command {
  return new Command("analyze")
    .description("Merchant-side market analysis for one (category, location) pair")
    .requiredOption("-c, --category <slug>", "category slug")
    .requiredOption("-l, --location <slug>", "location slug")
    .option(
      "-f, --format <fmt>",
      "json (default for pipes) | table (human-friendly) | markdown",
      (v) => v as OutputFormat,
    )
    .action(async (opts) => {
      const cfg = loadConfig();
      const store = new DealStore(cfg.SQLITE_PATH);
      try {
        const result = analyzeMarket(store, {
          categorySlug: opts.category,
          locationSlug: opts.location,
        });
        const format = opts.format ?? detectDefaultFormat();
        if (format === "json") {
          process.stdout.write(formatJson(result) + "\n");
          return;
        }
        // Pretty print
        const lines: string[] = [];
        const sep = (s: string) => `\n\x1b[1;36m== ${s} ==\x1b[0m`;
        lines.push(sep(`Market for ${result.category} × ${result.location}`));
        lines.push(`Total deals in segment: ${result.totalDeals}`);
        lines.push(sep("Prices (EUR)"));
        const p = result.prices;
        lines.push(
          `  count=${p.count}  min=${fmt(p.min)}  median=${fmt(p.median)}  mean=${fmt(p.mean)}  max=${fmt(p.max)}  stddev=${fmt(p.stdDev)}`,
        );
        lines.push(sep("Discount distribution"));
        for (const b of result.discounts.buckets) {
          const bar = "█".repeat(Math.min(40, b.count * 2));
          lines.push(`  ${b.range.padEnd(8)} ${String(b.count).padStart(3)}  ${bar}`);
        }
        lines.push(
          `  mean=${fmt(result.discounts.mean)}%  median=${fmt(result.discounts.median)}%`,
        );
        lines.push(sep(`Top ${result.topPerformers.length} performers`));
        for (const d of result.topPerformers) {
          const price = d.priceCents !== null ? `${(d.priceCents / 100).toFixed(2)}€` : "—";
          const disc = d.discountPct !== null ? ` -${d.discountPct}%` : "";
          const rating = d.rating !== null ? ` ★${d.rating.toFixed(1)}` : "";
          lines.push(`  • ${truncate(d.title, 80)}\n      ${price}${disc}${rating}  ${d.merchantName ?? ""}`);
        }
        if (result.underservedSubsegments.length > 0) {
          lines.push(sep("Underserved nearby locations"));
          for (const s of result.underservedSubsegments) lines.push(`  • ${s}`);
        }
        if (result.commonTitleTokens.length > 0) {
          lines.push(sep("Common copy tokens in this segment"));
          for (const c of result.commonTitleTokens.slice(0, 10)) {
            const star = c.avgRating !== null ? `★${c.avgRating.toFixed(1)}` : "—";
            const disc = c.avgDiscountPct !== null ? `${c.avgDiscountPct}%` : "—";
            lines.push(`  • ${c.token.padEnd(16)} ×${c.occurrences}  avg rating ${star}, avg disc ${disc}`);
          }
        }
        process.stdout.write(lines.join("\n") + "\n");
      } finally {
        store.close();
      }
    });
}

function fmt(n: number | null): string {
  return n === null ? "—" : String(n);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
