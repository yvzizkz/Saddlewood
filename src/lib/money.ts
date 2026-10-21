// The one money formatter: cents in, US dollars out. Client-safe and pure.
//
//   usd(123456)                  "$1,234.56"
//   usd(123456, { whole: true }) "$1,235"
//   usd(50000, { cents: "auto" }) "$500"   (and "$500.25" when there are cents)
//   usd(250000000, { compact: true }) "$2.5M" (at $100,000 and up)

export type UsdOptions = {
  /** No cents: rounded to the dollar. */
  whole?: boolean;
  /** Cents only when there are any. */
  cents?: "auto";
  /** $100,000 and up as "$2.5M". */
  compact?: boolean;
};

export function usd(cents: number, opts: UsdOptions = {}): string {
  if (opts.compact && Math.abs(cents) >= 100000_00) {
    return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
  }
  const whole = opts.whole || (opts.cents === "auto" && cents % 100 === 0);
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}
