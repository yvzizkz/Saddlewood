import { createClient } from '@/lib/supabase/server'
import type {
  ConfidenceLevel,
  DashboardEstimateRow,
  DimensionType,
  Estimate,
  EstimateBundle,
  Job,
  LineItem,
  ReviewStatus,
  Trade,
  TradeStatus,
} from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Supabase returns Postgres `numeric` as string in @supabase/supabase-js.
// Normalize through Number(), tolerating null/undefined.
function num(value: unknown): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : value === null || value === undefined ? null : String(value)
}

function asReviewStatus(value: unknown): ReviewStatus {
  const allowed: readonly ReviewStatus[] = [
    'draft',
    'in_review',
    'approved',
    'sent',
    'archived',
    'cancelled',
    'changes_requested',
  ]
  return allowed.includes(value as ReviewStatus) ? (value as ReviewStatus) : 'draft'
}

function asTradeStatus(value: unknown): TradeStatus {
  const allowed: readonly TradeStatus[] = ['SP', 'SUB', 'DEFERRED', 'NIS']
  return allowed.includes(value as TradeStatus) ? (value as TradeStatus) : 'SP'
}

function asConfidence(value: unknown): ConfidenceLevel | null {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return null
}

function asDimensionType(value: unknown): DimensionType | null {
  if (
    value === 'written' ||
    value === 'scaled' ||
    value === 'schedule' ||
    value === 'calculated' ||
    value === 'assumed'
  ) {
    return value
  }
  return null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => (typeof v === 'string' ? v : String(v)))
}

// Row shapes coming back from Supabase — `unknown`-keyed so we can normalize
// numeric/string columns via the helpers above without leaking any `any`.
type Row = Record<string, unknown>

function mapLineItem(row: Row): LineItem {
  return {
    id: asString(row.id),
    trade_id: asString(row.trade_id),
    description: asString(row.description),
    area_location: nullableString(row.area_location),
    quantity: num(row.quantity),
    unit: nullableString(row.unit),
    material_unit_cost: num(row.material_unit_cost),
    labor_unit_cost: num(row.labor_unit_cost),
    labor_hours_per_unit: nullableNum(row.labor_hours_per_unit),
    total: num(row.total),
    source_sheet: nullableString(row.source_sheet),
    source_grid: nullableString(row.source_grid),
    dimension_type: asDimensionType(row.dimension_type),
    confidence: asConfidence(row.confidence),
    flags: asStringArray(row.flags),
    is_allowance: Boolean(row.is_allowance),
    is_deleted: Boolean(row.is_deleted),
    is_manual_override: Boolean(row.is_manual_override),
    sort_order: Math.trunc(num(row.sort_order)),
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getEstimateWithTrades(id: string): Promise<EstimateBundle> {
  const supabase = await createClient()

  const { data: estimateRow, error: estErr } = await supabase
    .from('estimates')
    .select(
      `
      id, job_id, version, review_status,
      overhead_pct, profit_pct, contingency_pct, gc_sub_markup_pct,
      direct_cost, grand_total,
      approved_by, approved_at,
      created_at, updated_at
      `
    )
    .eq('id', id)
    .single()

  if (estErr || !estimateRow) {
    throw estErr ?? new Error('Estimate not found')
  }
  const estRow: Row = estimateRow as Row

  const { data: jobRow, error: jobErr } = await supabase
    .from('jobs')
    .select('id, name, client_name, address, bid_due_date, project_type')
    .eq('id', asString(estRow.job_id))
    .single()

  if (jobErr || !jobRow) {
    throw jobErr ?? new Error('Job not found')
  }
  const jRow: Row = jobRow as Row

  const { data: tradeRows, error: tradeErr } = await supabase
    .from('estimate_trades')
    .select(
      'id, estimate_id, trade_name, trade_status, sort_order, labor_rate_override, ai_blended_labor_rate'
    )
    .eq('estimate_id', id)
    .order('sort_order')

  if (tradeErr) throw tradeErr
  const tradeList: Row[] = (tradeRows ?? []) as Row[]
  const tradeIds: string[] = tradeList.map((t) => asString(t.id))

  // Avoid invalid `.in('trade_id', [])` — skip the query entirely when there
  // are no trades. Supabase rejects empty `in` filters on some clients.
  let lineItemRows: Row[] = []
  if (tradeIds.length > 0) {
    const { data, error: liErr } = await supabase
      .from('estimate_line_items')
      .select(
        `
        id, trade_id, description, area_location, quantity, unit,
        material_unit_cost, labor_unit_cost, labor_hours_per_unit, total,
        source_sheet, source_grid, dimension_type, confidence, flags,
        is_allowance, is_deleted, is_manual_override, sort_order
        `
      )
      .in('trade_id', tradeIds)
      .eq('is_deleted', false)
      .order('sort_order')
    if (liErr) throw liErr
    lineItemRows = (data ?? []) as Row[]
  }

  const lineItems: LineItem[] = lineItemRows.map(mapLineItem)

  // Recompute flag_count + direct_cost client-side. The DB columns may be
  // stale until Marco saves, so we don't trust them here.
  const flag_count = lineItems.reduce(
    (acc, li) => (li.flags.length > 0 ? acc + 1 : acc),
    0
  )
  const direct_cost = lineItems.reduce((acc, li) => acc + li.total, 0)

  const overhead_pct = num(estRow.overhead_pct)
  const profit_pct = num(estRow.profit_pct)
  const contingency_pct = num(estRow.contingency_pct)
  const gc_sub_markup_pct = num(estRow.gc_sub_markup_pct)

  // gc_sub_markup_pct is intentionally ignored in Phase 3 — it's a per-SUB
  // markup surfaced in Phase 4.
  const grand_total =
    direct_cost *
    (1 + contingency_pct / 100) *
    (1 + overhead_pct / 100) *
    (1 + profit_pct / 100)

  const estimate: Estimate = {
    id: asString(estRow.id),
    job_id: asString(estRow.job_id),
    version: Math.trunc(num(estRow.version)),
    review_status: asReviewStatus(estRow.review_status),
    config: {
      overhead_pct,
      profit_pct,
      contingency_pct,
      gc_sub_markup_pct,
    },
    direct_cost,
    grand_total,
    trade_ids: tradeIds,
    flag_count,
    created_at: asString(estRow.created_at),
    updated_at: asString(estRow.updated_at),
    approved_by: nullableString(estRow.approved_by),
    approved_at: nullableString(estRow.approved_at),
  }

  const job: Job = {
    id: asString(jRow.id),
    name: asString(jRow.name),
    client_name: nullableString(jRow.client_name),
    address: nullableString(jRow.address),
    bid_due_date: nullableString(jRow.bid_due_date),
    project_type: nullableString(jRow.project_type),
  }

  const trades: Trade[] = tradeList.map((t) => ({
    id: asString(t.id),
    estimate_id: asString(t.estimate_id),
    trade_name: asString(t.trade_name),
    trade_status: asTradeStatus(t.trade_status),
    sort_order: Math.trunc(num(t.sort_order)),
    labor_rate_override: nullableNum(t.labor_rate_override),
    ai_blended_labor_rate: nullableNum(t.ai_blended_labor_rate),
    // Populated in store.hydrate():
    line_item_ids: [],
    subtotal: 0,
    flag_count: 0,
    worst_confidence: null,
  }))

  return { estimate, job, trades, line_items: lineItems }
}

// ─── Dashboard listing ───────────────────────────────────────────────────────

export async function countPendingEstimates(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .in('review_status', ['draft', 'in_review', 'changes_requested'])
  if (error) throw error
  return count ?? 0
}

export async function listEstimatesForDashboard(): Promise<DashboardEstimateRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('estimates')
    .select(
      `
      id, job_id, version, review_status, direct_cost, grand_total, updated_at,
      job:jobs(id, name, client_name, bid_due_date, project_type)
      `
    )
    .neq('review_status', 'archived')
    .order('updated_at', { ascending: false })

  if (error) throw error
  const rows: Row[] = (data ?? []) as Row[]

  return rows.map((row): DashboardEstimateRow => {
    // The PostgREST `job:jobs(...)` shape comes back as a single object when
    // the FK is to-one, or as an array on some client versions. Normalize.
    const rawJob = row.job
    let jobObj: Row | null = null
    if (Array.isArray(rawJob)) {
      jobObj = (rawJob[0] as Row | undefined) ?? null
    } else if (rawJob && typeof rawJob === 'object') {
      jobObj = rawJob as Row
    }

    return {
      id: asString(row.id),
      job_id: asString(row.job_id),
      version: Math.trunc(num(row.version)),
      review_status: asReviewStatus(row.review_status),
      direct_cost: num(row.direct_cost),
      grand_total: num(row.grand_total),
      updated_at: asString(row.updated_at),
      job: jobObj
        ? {
            id: asString(jobObj.id),
            name: asString(jobObj.name),
            client_name: nullableString(jobObj.client_name),
            bid_due_date: nullableString(jobObj.bid_due_date),
            project_type: nullableString(jobObj.project_type),
          }
        : null,
    }
  })
}
