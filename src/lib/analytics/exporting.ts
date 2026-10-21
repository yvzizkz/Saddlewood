// Table export: CSV always, XLSX on demand (exceljs is loaded only when someone
// asks for a workbook, so it never weighs on the page). Client-safe.

export type ExportColumn<T> = {
  header: string;
  /** The raw value: numbers stay numbers so a spreadsheet can add them up. */
  value: (row: T) => string | number | null | undefined;
  /** Excel number format, e.g. '"$"#,##0.00' or '0.00'. */
  numFmt?: string;
};

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // A leading =, +, - or @ makes a spreadsheet run the cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v !== "number" ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T>(rows: readonly T[], columns: readonly ExportColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function exportName(base: string, ext: "csv" | "xlsx", day: string): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `saddlewood-${slug || "export"}-${day}.${ext}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv<T>(rows: readonly T[], columns: readonly ExportColumn<T>[], name: string) {
  // The BOM makes Excel read the file as UTF-8 (names with accents, the en dash).
  download(new Blob(["﻿" + toCsv(rows, columns)], { type: "text/csv;charset=utf-8" }), name);
}

export async function downloadXlsx<T>(rows: readonly T[], columns: readonly ExportColumn<T>[], name: string, sheet = "Export") {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, width: Math.max(10, Math.min(40, c.header.length + 6)) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) ws.addRow(columns.map((c) => c.value(r) ?? null));
  columns.forEach((c, i) => {
    if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt;
  });
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name);
}
