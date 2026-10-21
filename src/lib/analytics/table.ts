// Search, filter and sort for DataTable. Pure, so it is tested without a DOM.

import type { ValueKind } from "./format";

export type TableRow = { id: string } & Record<string, string | number | boolean | null | undefined>;

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Every word must appear in one of the search fields; filters match exactly. */
export function filterRows(rows: readonly TableRow[], o: { q: string; searchKeys: readonly string[]; filters: Record<string, string> }): TableRow[] {
  const words = norm(o.q).split(/\s+/).filter(Boolean);
  const active = Object.entries(o.filters).filter(([, v]) => v !== "");
  return rows.filter((r) => {
    for (const [k, v] of active) if (String(r[k] ?? "") !== v) return false;
    if (!words.length) return true;
    const hay = norm(o.searchKeys.map((k) => String(r[k] ?? "")).join(" "));
    return words.every((w) => hay.includes(w));
  });
}

export function sortRows(rows: TableRow[], key: string, dir: "asc" | "desc", kind: ValueKind): TableRow[] {
  const numeric = kind === "money" || kind === "hours" || kind === "count" || kind === "percent";
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    // Blanks sink to the bottom whichever way the column is sorted.
    const xb = x === null || x === undefined || x === "";
    const yb = y === null || y === undefined || y === "";
    if (xb || yb) return xb === yb ? 0 : xb ? 1 : -1;
    if (numeric) return sign * (Number(x) - Number(y));
    return sign * String(x).localeCompare(String(y), "en-US", { numeric: true });
  });
}
