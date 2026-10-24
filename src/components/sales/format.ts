// Small formatters shared by the Sales screens.

// The one money formatter (src/lib/money.ts), under the name these screens use.
export { usd } from "@/lib/money";

/** Dollars (a unit price) with as many decimals as it needs, up to 4. */
export function dollars(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function shortDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Phoenix" });
}

export function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Phoenix" });
}

/** "today", "3d", "5w" since an instant or a day. */
export function ago(iso: string, now: Date = new Date()): string {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Date.parse(`${iso}T12:00:00Z`) : Date.parse(iso);
  const days = Math.floor((now.getTime() - t) / 86400000);
  if (days <= 0) return "today";
  if (days < 14) return `${days}d`;
  if (days < 70) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}


/** A short name for an email address: "marco@saddlewood…" → "Marco". */
export function personName(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/^crew:\s*/, "");
  if (!local || local === "agent") return "Bot";
  return local.charAt(0).toUpperCase() + local.slice(1);
}
