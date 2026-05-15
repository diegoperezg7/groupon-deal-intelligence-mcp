import { formatJson } from "./json.js";
import { formatTable, type TableColumn } from "./table.js";
import { formatMarkdown } from "./markdown.js";

export type OutputFormat = "json" | "table" | "markdown";

export function detectDefaultFormat(): OutputFormat {
  return process.stdout.isTTY ? "table" : "json";
}

export function emit<Row>(
  format: OutputFormat,
  rows: Row[],
  columns: TableColumn<Row>[],
  fullValue?: unknown,
): void {
  if (format === "json") {
    process.stdout.write(formatJson(fullValue ?? rows) + "\n");
    return;
  }
  if (format === "markdown") {
    process.stdout.write(formatMarkdown(rows, columns) + "\n");
    return;
  }
  process.stdout.write(formatTable(rows, columns) + "\n");
}

export { formatJson, formatTable, formatMarkdown };
export type { TableColumn };
