// CSV formula injection: Excel/Sheets treat a cell starting with =, +, -, or
// @ as a formula when the file is opened, not plain text -- a survey answer
// or staff name containing one (accidentally or not) can execute a formula
// on whoever opens the export. A leading apostrophe is the standard
// mitigation: it forces the cell to text and is invisible in normal
// spreadsheet display.
const FORMULA_TRIGGER_CHARS = /^[=+\-@]/;

function escapeCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_TRIGGER_CHARS.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds a CSV string (with header row) from an array of objects, in the given column order. */
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}

export function csvResponse(csv: string, filename: string): Response {
  // Leading BOM so Excel (which otherwise guesses the system codepage) opens
  // UTF-8 CSVs with non-ASCII characters -- names, etc. -- rendered correctly.
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
