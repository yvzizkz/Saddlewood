// The daily log's "trades on site" line: free text, with a tap per trade of
// ours (the shared list's SELF_PERFORMED) that adds or takes it off.

/** "Framing, HVAC" -> ["Framing", "HVAC"]. */
export function onSite(text: string): string[] {
  return text.split(",").map((t) => t.trim()).filter(Boolean);
}

/** Add or take a trade off the "trades on site" line, keeping anything else typed there. */
export function toggleOnSite(text: string, label: string): string {
  const list = onSite(text);
  return (list.includes(label) ? list.filter((t) => t !== label) : [...list, label]).join(", ");
}
