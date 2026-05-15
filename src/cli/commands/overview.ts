import { Command } from "commander";
import { DealStore, buildCatalogOverview } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { detectDefaultFormat, formatJson, type OutputFormat } from "../format/index.js";

export function buildOverviewCommand(): Command {
  return new Command("overview")
    .description("Single-call catalogue overview: totals, prices, discounts, top buckets")
    .option(
      "-f, --format <fmt>",
      "json (default for pipes) | table (human-friendly) | markdown",
      (v) => v as OutputFormat,
    )
    .action(async (opts) => {
      const cfg = loadConfig();
      const store = new DealStore(cfg.SQLITE_PATH);
      try {
        const overview = buildCatalogOverview(store);
        const format = opts.format ?? detectDefaultFormat();
        if (format === "json") {
          process.stdout.write(formatJson(overview) + "\n");
          return;
        }
        if (format === "markdown") {
          process.stdout.write(renderMarkdown(overview) + "\n");
          return;
        }
        process.stdout.write(renderPretty(overview) + "\n");
      } finally {
        store.close();
      }
    });
}

function renderPretty(o: ReturnType<typeof buildCatalogOverview>): string {
  const lines: string[] = [];
  const sep = (s: string) => `\n\x1b[1;36m== ${s} ==\x1b[0m`;
  lines.push(sep("Totals"));
  lines.push(
    `  deals=${o.totals.deals}  categories=${o.totals.categories}  locations=${o.totals.locations}  merchants=${o.totals.merchants}`,
  );
  lines.push(sep("Prices (EUR)"));
  const p = o.prices;
  lines.push(
    `  count=${p.count}  min=${fmt(p.minEuros)}  median=${fmt(p.medianEuros)}  mean=${fmt(p.meanEuros)}  max=${fmt(p.maxEuros)}  stddev=${fmt(p.stdDevEuros)}`,
  );
  lines.push(sep("Discount distribution"));
  for (const b of o.discounts.buckets) {
    const bar = "█".repeat(Math.min(40, b.count));
    lines.push(`  ${b.range.padEnd(8)} ${String(b.count).padStart(4)}  ${bar}`);
  }
  lines.push(
    `  with discount=${o.discounts.withDiscountCount}  mean=${fmt(o.discounts.meanPct)}%  median=${fmt(o.discounts.medianPct)}%`,
  );
  lines.push(sep("Top categories"));
  for (const c of o.topCategories) {
    lines.push(`  • ${c.name.padEnd(28)} ${String(c.dealCount).padStart(4)}  (${c.slug})`);
  }
  lines.push(sep("Top locations"));
  for (const l of o.topLocations) {
    lines.push(`  • ${l.name.padEnd(28)} ${String(l.dealCount).padStart(4)}  (${l.slug})`);
  }
  lines.push(sep("Top merchants"));
  for (const m of o.topMerchants) {
    const star = m.ratingAvg !== null ? ` ★${m.ratingAvg.toFixed(2)}` : "";
    lines.push(
      `  • ${truncate(m.name, 32).padEnd(32)} ${String(m.dealCount).padStart(4)}${star}  (${m.id})`,
    );
  }
  lines.push(sep("Freshness"));
  lines.push(`  earliest scrape: ${o.freshness.earliestScrapedAt ?? "—"}`);
  lines.push(`  latest scrape:   ${o.freshness.latestScrapedAt ?? "—"}`);
  return lines.join("\n");
}

function renderMarkdown(o: ReturnType<typeof buildCatalogOverview>): string {
  const lines: string[] = [];
  lines.push("## Totals");
  lines.push(
    `- **deals**: ${o.totals.deals}\n- **categories**: ${o.totals.categories}\n- **locations**: ${o.totals.locations}\n- **merchants**: ${o.totals.merchants}`,
  );
  lines.push("");
  lines.push("## Prices (EUR)");
  const p = o.prices;
  lines.push(
    `count=${p.count}, min=${fmt(p.minEuros)}, median=${fmt(p.medianEuros)}, mean=${fmt(p.meanEuros)}, max=${fmt(p.maxEuros)}, stddev=${fmt(p.stdDevEuros)}`,
  );
  lines.push("");
  lines.push("## Discount distribution");
  lines.push("| Range | Count |");
  lines.push("|---|---|");
  for (const b of o.discounts.buckets) {
    lines.push(`| ${b.range} | ${b.count} |`);
  }
  lines.push(
    `\nwith discount=${o.discounts.withDiscountCount}, mean=${fmt(o.discounts.meanPct)}%, median=${fmt(o.discounts.medianPct)}%`,
  );
  lines.push("");
  lines.push("## Top categories");
  for (const c of o.topCategories) lines.push(`- ${c.name} (${c.slug}) — ${c.dealCount}`);
  lines.push("");
  lines.push("## Top locations");
  for (const l of o.topLocations) lines.push(`- ${l.name} (${l.slug}) — ${l.dealCount}`);
  lines.push("");
  lines.push("## Top merchants");
  for (const m of o.topMerchants) {
    const star = m.ratingAvg !== null ? ` ★${m.ratingAvg.toFixed(2)}` : "";
    lines.push(`- ${m.name} (${m.id}) — ${m.dealCount}${star}`);
  }
  return lines.join("\n");
}

function fmt(n: number | null): string {
  return n === null ? "—" : String(n);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
