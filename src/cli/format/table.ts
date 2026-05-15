/**
 * Minimal table renderer — no dependencies, prints UTF-8 box drawing.
 * Truncates cells to `maxColWidth` so long titles stay readable.
 */

export interface TableColumn<Row> {
  header: string;
  accessor: (row: Row) => string | number | null | undefined;
  align?: "left" | "right";
  maxWidth?: number;
}

const DEFAULT_MAX_COL_WIDTH = 50;

export function formatTable<Row>(rows: Row[], columns: TableColumn<Row>[]): string {
  if (rows.length === 0) return "(no rows)";

  const headers = columns.map((c) => c.header);
  const cells = rows.map((r) =>
    columns.map((c) => {
      const raw = c.accessor(r);
      const str =
        raw === null || raw === undefined
          ? "—"
          : typeof raw === "number"
            ? raw.toString()
            : raw;
      const limit = c.maxWidth ?? DEFAULT_MAX_COL_WIDTH;
      return str.length > limit ? str.slice(0, limit - 1) + "…" : str;
    }),
  );

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...cells.map((row) => row[i].length)),
  );

  const sep = "├" + widths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
  const top = "┌" + widths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
  const bot = "└" + widths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";
  const renderRow = (cells: string[]) =>
    "│ " +
    cells
      .map((c, i) =>
        columns[i].align === "right" ? c.padStart(widths[i]) : c.padEnd(widths[i]),
      )
      .join(" │ ") +
    " │";

  return [
    top,
    renderRow(headers),
    sep,
    ...cells.map((r) => renderRow(r)),
    bot,
  ].join("\n");
}
