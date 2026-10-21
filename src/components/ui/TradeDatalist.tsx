import { DEFAULT_TRADES } from '@/lib/accounting/tradeList'

// The shared trade list as suggestions for a free-text trade field: pick one,
// or type a trade that is not on it. `lower` matches the subs directory,
// which keeps trades in lower case ("windows and doors").
export function TradeDatalist({ id, lower = false }: { id: string; lower?: boolean }) {
  return (
    <datalist id={id}>
      {DEFAULT_TRADES.map((t) => (
        <option key={t.slug} value={lower ? t.label.toLowerCase() : t.label} />
      ))}
    </datalist>
  )
}
