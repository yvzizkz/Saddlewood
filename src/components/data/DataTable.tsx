'use client'

// The list under every KPI header. Search, a filter per column, sort,
// multi-select, totals, and export (CSV, or an Excel workbook) of everything
// shown or just the selected rows. On a phone the rows become cards.
//
// Rows arrive already narrowed by the drill-down (the URL); everything here is
// instant and local. Bulk actions are the safe kind only: export and the
// total of what is selected. Nothing here writes.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Download, Search, X } from 'lucide-react'

import { downloadCsv, downloadXlsx, exportName, type ExportColumn } from '@/lib/analytics/exporting'
import { excelFormat, exportValue, formatValue, type ValueKind } from '@/lib/analytics/format'
import { localDay } from '@/lib/crew/time'
import { filterRows, sortRows, type TableRow } from '@/lib/analytics/table'

export type Column = {
  key: string
  header: string
  kind: ValueKind
  /** A dropdown of this column's values above the table. */
  filter?: boolean
  /** Sum in the footer and the selection bar. */
  total?: boolean
  /** Row field holding a link for this cell (e.g. the job page). */
  hrefKey?: string
  /** Row field shown small under the value. */
  subKey?: string
  /** Where the cell goes on a phone card. Default: a detail line. */
  phone?: 'title' | 'value' | 'detail' | 'hide'
  align?: 'left' | 'right'
}

export type { TableRow }

type Sort = { key: string; dir: 'asc' | 'desc' }

export default function DataTable({
  rows,
  columns,
  searchKeys,
  name,
  rowHrefKey,
  initialSort,
  empty = 'Nothing matches.',
  pageSize = 50,
  initialQuery = '',
}: {
  rows: TableRow[]
  columns: Column[]
  searchKeys: string[]
  /** For the export file name: "payroll-week". */
  name: string
  rowHrefKey?: string
  initialSort?: Sort
  empty?: string
  pageSize?: number
  /** Starts the search box filled in, e.g. from a link's ?q= (an invoice number). */
  initialQuery?: string
}) {
  const [q, setQ] = useState(initialQuery)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<Sort | null>(initialSort ?? null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [shown, setShown] = useState(pageSize)
  const [busy, setBusy] = useState(false)

  const filterCols = columns.filter((c) => c.filter)
  const options = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const c of filterCols) {
      const vals = new Set<string>()
      for (const r of rows) {
        const v = r[c.key]
        if (v !== null && v !== undefined && v !== '') vals.add(String(v))
      }
      m[c.key] = [...vals].sort((a, b) => a.localeCompare(b))
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns])

  const visible = useMemo(() => {
    const kindOf = (k: string) => columns.find((c) => c.key === k)?.kind ?? 'text'
    const f = filterRows(rows, { q, searchKeys, filters })
    return sort ? sortRows(f, sort.key, sort.dir, kindOf(sort.key)) : f
  }, [rows, q, searchKeys, filters, sort, columns])

  const page = visible.slice(0, shown)
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id))
  const selRows = visible.filter((r) => selected.has(r.id))
  const totals = columns.filter((c) => c.total)
  const sumOf = (rs: TableRow[], k: string) => rs.reduce((a, r) => a + (Number(r[k]) || 0), 0)

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)))

  const exportCols: ExportColumn<TableRow>[] = columns.flatMap((c) => {
    const main: ExportColumn<TableRow> = { header: c.header, value: (r) => exportValue(c.kind, r[c.key]), numFmt: excelFormat(c.kind) }
    return c.subKey ? [main, { header: `${c.header} (detail)`, value: (r) => (r[c.subKey!] as string) ?? '' }] : [main]
  })
  const doExport = async (kind: 'csv' | 'xlsx', which: TableRow[]) => {
    const file = exportName(which.length === visible.length ? name : `${name}-selected`, kind, localDay())
    if (kind === 'csv') downloadCsv(which, exportCols, file)
    else {
      setBusy(true)
      try {
        await downloadXlsx(which, exportCols, file, name)
      } finally {
        setBusy(false)
      }
    }
  }

  const clickSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: columns.find((c) => c.key === key)?.kind === 'text' ? 'asc' : 'desc' }))

  const cell = (c: Column, r: TableRow) => {
    const text = formatValue(c.kind, r[c.key])
    const href = c.hrefKey ? (r[c.hrefKey] as string | null) : null
    return (
      <>
        {href ? (
          <Link href={href} className="text-[var(--color-charcoal)] underline decoration-[var(--color-stone-mid)] underline-offset-2 hover:decoration-[var(--color-charcoal)]">
            {text}
          </Link>
        ) : (
          text
        )}
        {c.subKey && r[c.subKey] ? <span className="block text-[11px] text-[var(--color-charcoal-light)]">{String(r[c.subKey])}</span> : null}
      </>
    )
  }

  const title = columns.find((c) => c.phone === 'title') ?? columns[0]
  const value = columns.find((c) => c.phone === 'value')
  const details = columns.filter((c) => c !== title && c !== value && c.phone !== 'hide')

  return (
    <section data-table={name} className="rounded-2xl border border-[var(--color-stone)] bg-white">
      {/* Controls: one row above the rows they scope. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-stone)] p-3">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9a938a]" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setShown(pageSize)
            }}
            placeholder="Search"
            className="w-full rounded-xl border border-[var(--color-stone-mid)] bg-white py-2 pl-9 pr-3 text-base text-[var(--color-charcoal)] placeholder:text-[#9a938a] focus:border-[var(--color-teal)] focus:outline-none md:text-sm"
          />
        </label>
        {filterCols.map((c) => (
          <label key={c.key} className="min-w-0">
            <span className="sr-only">{c.header}</span>
            <select
              value={filters[c.key] ?? ''}
              onChange={(e) => {
                setFilters((f) => ({ ...f, [c.key]: e.target.value }))
                setShown(pageSize)
              }}
              className={`max-w-[11rem] rounded-xl border px-3 py-2 text-base md:text-sm ${
                filters[c.key] ? 'border-[var(--color-teal)] bg-[rgba(24,40,40,0.04)] text-[var(--color-charcoal)]' : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal-light)]'
              }`}
            >
              <option value="">{`Any ${c.header.toLowerCase()}`}</option>
              {(options[c.key] ?? []).map((o) => (
                <option key={o} value={o}>
                  {formatValue(c.kind, o)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => doExport('csv', visible)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--color-stone-mid)] px-3 text-sm text-[var(--color-charcoal)] hover:bg-[var(--color-cream)]">
            <Download className="size-4" aria-hidden="true" /> CSV
          </button>
          <button type="button" disabled={busy} onClick={() => doExport('xlsx', visible)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--color-stone-mid)] px-3 text-sm text-[var(--color-charcoal)] hover:bg-[var(--color-cream)] disabled:opacity-50">
            <Download className="size-4" aria-hidden="true" /> Excel
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-[var(--color-charcoal-light)]">
        <span data-rows={visible.length}>
          {visible.length.toLocaleString('en-US')} {visible.length === 1 ? 'row' : 'rows'}
          {visible.length !== rows.length ? ` of ${rows.length.toLocaleString('en-US')}` : ''}
        </span>
        {totals.length ? (
          <span className="tabular-nums">
            {totals.map((c) => (
              <span key={c.key} className="ml-3">
                {c.header}: <span className="font-semibold text-[var(--color-charcoal)]">{formatValue(c.kind, sumOf(visible, c.key))}</span>
              </span>
            ))}
          </span>
        ) : null}
      </div>

      {selected.size > 0 ? (
        <div className="sticky top-[53px] z-20 mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--color-teal)] px-3 py-2 text-sm text-white">
          <span className="font-medium">{selRows.length} selected</span>
          {totals.map((c) => (
            <span key={c.key} className="tabular-nums opacity-90">
              {c.header} {formatValue(c.kind, sumOf(selRows, c.key))}
            </span>
          ))}
          <span className="ml-auto flex gap-1">
            <button type="button" onClick={() => doExport('csv', selRows)} className="rounded-lg bg-white/10 px-2.5 py-1 hover:bg-white/20">
              Export CSV
            </button>
            <button type="button" onClick={() => doExport('xlsx', selRows)} className="rounded-lg bg-white/10 px-2.5 py-1 hover:bg-white/20">
              Excel
            </button>
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" className="rounded-lg px-1.5 py-1 hover:bg-white/20">
              <X className="size-4" />
            </button>
          </span>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-[var(--color-charcoal-light)]">{empty}</p>
      ) : (
        <>
          {/* Phone: cards. */}
          <ul className="divide-y divide-[var(--color-stone)] md:hidden">
            {page.map((r) => {
              const href = rowHrefKey ? (r[rowHrefKey] as string | null) : null
              const on = selected.has(r.id)
              return (
                <li key={r.id} className={`flex gap-3 px-3 py-3 ${on ? 'bg-[rgba(24,40,40,0.04)]' : ''}`}>
                  <Checkbox on={on} onClick={() => toggle(r.id)} label={`Select ${String(r[title.key] ?? '')}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-[var(--color-charcoal)]">
                        {href ? <Link href={href}>{formatValue(title.kind, r[title.key])}</Link> : formatValue(title.kind, r[title.key])}
                      </p>
                      {value ? <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--color-charcoal)]">{formatValue(value.kind, r[value.key])}</p> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--color-charcoal-light)]">
                      {details
                        .map((c) => formatValue(c.kind, r[c.key]))
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Desktop: a real table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-[var(--color-stone)] bg-[#faf7f2] text-left text-[11px] uppercase tracking-[0.08em] text-[var(--color-charcoal-light)]">
                  <th className="w-10 px-3 py-2">
                    <Checkbox on={allSelected} onClick={toggleAll} label="Select all rows" />
                  </th>
                  {columns.map((c) => {
                    const right = c.align === 'right' || (c.align === undefined && ['money', 'hours', 'count', 'percent'].includes(c.kind))
                    const active = sort?.key === c.key
                    return (
                      <th key={c.key} className={`px-3 py-2 font-medium ${right ? 'text-right' : ''}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" onClick={() => clickSort(c.key)} className={`inline-flex items-center gap-1 hover:text-[var(--color-charcoal)] ${active ? 'text-[var(--color-charcoal)]' : ''}`}>
                          {c.header}
                          {active ? sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {page.map((r) => {
                  const on = selected.has(r.id)
                  return (
                    <tr key={r.id} className={`border-b border-[var(--color-stone)] last:border-0 ${on ? 'bg-[rgba(24,40,40,0.04)]' : 'hover:bg-[#fcfaf6]'}`}>
                      <td className="px-3 py-2.5">
                        <Checkbox on={on} onClick={() => toggle(r.id)} label="Select row" />
                      </td>
                      {columns.map((c) => {
                        const right = c.align === 'right' || (c.align === undefined && ['money', 'hours', 'count', 'percent'].includes(c.kind))
                        return (
                          <td key={c.key} className={`px-3 py-2.5 text-[var(--color-charcoal)] ${right ? 'text-right tabular-nums' : ''}`}>
                            {cell(c, r)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
              {totals.length ? (
                <tfoot>
                  <tr className="border-t border-[var(--color-stone-mid)] bg-[#faf7f2] font-semibold">
                    <td className="px-3 py-2" />
                    {columns.map((c, i) => (
                      <td key={c.key} data-total={c.total ? c.key : undefined} className={`px-3 py-2 ${c.total ? 'text-right tabular-nums' : ''}`}>
                        {c.total ? formatValue(c.kind, sumOf(visible, c.key)) : i === 0 ? 'Total' : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          {visible.length > shown ? (
            <div className="border-t border-[var(--color-stone)] p-3 text-center">
              <button type="button" onClick={() => setShown((s) => s + pageSize * 2)} className="min-h-10 rounded-xl px-4 text-sm font-medium text-[var(--color-charcoal)] hover:bg-[var(--color-cream)]">
                Show more ({(visible.length - shown).toLocaleString('en-US')} left)
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function Checkbox({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
        on ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] bg-white'
      }`}
    >
      {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
    </button>
  )
}
