import type { TableColumn } from "./table.js";

export function formatMarkdown<Row>(rows: Row[], columns: TableColumn<Row>[]): string {
  if (rows.length === 0) return "_(no rows)_";
  const header = `| ${columns.map((c) => c.header).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (r) =>
      `| ${columns
        .map((c) => {
          const v = c.accessor(r);
          if (v === null || v === undefined) return "—";
          return String(v).replace(/\|/g, "\\|");
        })
        .join(" | ")} |`,
  );
  return [header, sep, ...body].join("\n");
}
