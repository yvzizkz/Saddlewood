'use client'

// The three chart forms the Accounting screens use, drawn as plain SVG/HTML so
// they render on the server, cost a few kB and follow the brand exactly:
//
//   TrendChart       columns (few buckets) or an area line (many), a crosshair
//                    and one tooltip that snaps to the nearest bucket
//   BreakdownBars    ranked horizontal bars, each a link one level deeper
//   CompositionStrip one stacked bar of shares, 2px gaps between segments
//
// Marks follow the dataviz spec: bars <= 24px, 4px rounded data ends, 2px
// lines, hairline solid grid, values in ink (never the series color).

import Link from 'next/link'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { niceTicks } from '@/lib/analytics/aggregate'
import { formatValue, type ValueKind } from '@/lib/analytics/format'
import { ACCENT, ACCENT_WASH, GRID } from '@/lib/analytics/palette'

export type ChartPoint = { bucket: string; label: string; value: number }
export type ChartSlice = { key: string; label: string; value: number; share: number; count: number; color: string; href: string | null }

function useWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function TrendChart({ points, kind, height = 168, label }: { points: ChartPoint[]; kind: ValueKind; height?: number; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = points.length
  const max = Math.max(0, ...points.map((p) => p.value))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1] || 1
  const padL = 44
  const padR = 8
  const padT = 10
  const padB = 22
  const plotW = Math.max(1, width - padL - padR)
  const plotH = height - padT - padB
  const columns = n <= 16
  const band = plotW / Math.max(1, n)
  const x = (i: number) => padL + (columns ? band * i + band / 2 : n === 1 ? plotW / 2 : (plotW * i) / (n - 1))
  const y = (v: number) => padT + plotH - (v / top) * plotH

  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect()
    const px = clientX - r.left
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - px)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    setHover(best)
  }
  const onMove = (e: PointerEvent<SVGSVGElement>) => pick(e.clientX, e.currentTarget)
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1))
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1))
  }

  // Label every bucket when they fit, else about six of them.
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 56))))
  const barW = Math.min(24, Math.max(3, band * 0.62))
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const area = n > 1 ? `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : ''
  const h = hover !== null ? points[hover] : null

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label}: ${points.map((p) => `${p.label} ${formatValue(kind, p.value)}`).join(', ')}`}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
        className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] rounded-lg"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[#8a837a] text-[10px] tabular-nums">
              {formatValue(kind, t, { compact: true }).replace(/\.0 h$/, ' h')}
            </text>
          </g>
        ))}
        {columns
          ? points.map((p, i) => {
              const bh = Math.max(0, y(0) - y(p.value))
              const bx = x(i) - barW / 2
              const r = Math.min(4, bh, barW / 2)
              const active = hover === i
              return (
                <path
                  key={p.bucket}
                  d={`M${bx},${y(0)}V${y(0) - bh + r}Q${bx},${y(0) - bh} ${bx + r},${y(0) - bh}H${bx + barW - r}Q${bx + barW},${y(0) - bh} ${bx + barW},${y(0) - bh + r}V${y(0)}Z`}
                  fill={ACCENT}
                  opacity={hover === null || active ? 0.92 : 0.45}
                />
              )
            })
          : (
              <>
                <path d={area} fill={ACCENT_WASH} />
                <path d={line} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}
        {points.map((p, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={p.bucket} x={x(i)} y={height - 6} textAnchor={i === n - 1 && !columns ? 'end' : 'middle'} className="fill-[#8a837a] text-[10px]">
              {p.label}
            </text>
          ) : null,
        )}
        {h && hover !== null ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} stroke="#2c2926" strokeOpacity={0.25} strokeWidth={1} />
            {!columns ? <circle cx={x(hover)} cy={y(h.value)} r={4.5} fill={ACCENT} stroke="#fff" strokeWidth={2} /> : null}
          </g>
        ) : null}
      </svg>
      {h && hover !== null ? (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-[var(--color-stone)] bg-white px-2.5 py-1.5 shadow-sm"
          style={{ left: Math.min(Math.max(0, x(hover) - 60), width - 124), width: 120 }}
        >
          <p className="text-sm font-semibold tabular-nums text-[var(--color-charcoal)]">{formatValue(kind, h.value)}</p>
          <p className="text-[11px] text-[var(--color-charcoal-light)]">{h.label}</p>
        </div>
      ) : null}
    </div>
  )
}

export function CompositionStrip({ slices, kind }: { slices: ChartSlice[]; kind: ValueKind }) {
  const [hover, setHover] = useState<string | null>(null)
  const shown = slices.filter((s) => s.value > 0)
  if (shown.length === 0) return null
  const h = shown.find((s) => s.key === hover)
  return (
    <div className="relative">
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={shown.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(', ')}>
        {shown.map((s) => (
          <span
            key={s.key}
            onPointerEnter={() => setHover(s.key)}
            onPointerLeave={() => setHover(null)}
            className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
            style={{ flexGrow: s.value, flexBasis: 0, minWidth: 3, backgroundColor: s.color, opacity: hover && hover !== s.key ? 0.4 : 1 }}
          />
        ))}
      </div>
      {h ? (
        <p className="absolute -top-7 left-0 rounded-md border border-[var(--color-stone)] bg-white px-2 py-0.5 text-xs shadow-sm">
          <span className="font-semibold tabular-nums">{formatValue(kind, h.value)}</span>
          <span className="ml-1.5 text-[var(--color-charcoal-light)]">{h.label} · {Math.round(h.share * 100)}%</span>
        </p>
      ) : null}
    </div>
  )
}

export function BreakdownBars({ slices, kind, noun }: { slices: ChartSlice[]; kind: ValueKind; noun: string }) {
  const max = Math.max(0, ...slices.map((s) => Math.abs(s.value)))
  if (slices.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--color-charcoal-light)]">Nothing in this period.</p>
  }
  return (
    <ul className="space-y-1" aria-label={`By ${noun}`}>
      {slices.map((s) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: s.color }} />
                <span className="truncate text-sm text-[var(--color-charcoal)]">{s.label}</span>
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                <span className="font-semibold text-[var(--color-charcoal)]">{formatValue(kind, s.value)}</span>
                <span className="ml-2 inline-block w-9 text-right text-xs text-[var(--color-charcoal-light)]">{Math.round(s.share * 100)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full rounded-full bg-[rgba(44,41,38,0.05)]">
              <div className="h-2 rounded-full" style={{ width: `${max ? Math.max(1.5, (Math.abs(s.value) / max) * 100) : 0}%`, backgroundColor: s.color }} />
            </div>
          </>
        )
        return (
          <li key={s.key}>
            {s.href ? (
              <Link
                href={s.href}
                scroll={false}
                className="group block rounded-xl px-2 py-2 -mx-2 transition-colors hover:bg-[var(--color-cream)] focus-visible:bg-[var(--color-cream)] outline-none"
                aria-label={`${s.label}: ${formatValue(kind, s.value)}, ${Math.round(s.share * 100)}%. Show only ${s.label}`}
              >
                {body}
              </Link>
            ) : (
              <div className="px-2 py-2 -mx-2">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => `${((width - 4) * i) / (values.length - 1) + 2},${height - 3 - ((height - 6) * v) / max}`)
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke="#a39c92" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r={3} fill={ACCENT} stroke="#fff" strokeWidth={1.5} />
    </svg>
  )
}
