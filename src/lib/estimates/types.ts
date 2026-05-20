// Domain types for the estimate portal.
//
// All fields use snake_case mirroring DB columns so domain objects can pass
// straight from Supabase through to the Zustand store with no camelCase
// mapping layer. Same convention as Phase 4.

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export type DimensionType =
  | 'written'
  | 'scaled'
  | 'schedule'
  | 'calculated'
  | 'assumed'

export type ReviewStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'sent'
  | 'archived'
  | 'cancelled'
  | 'changes_requested'

export type TradeStatus = 'SP' | 'SUB' | 'DEFERRED' | 'NIS'

export interface LineItem {
  id: string
  trade_id: string
  description: string
  area_location: string | null
  quantity: number
  unit: string | null
  material_unit_cost: number
  labor_unit_cost: number
  labor_hours_per_unit: number | null
  total: number
  source_sheet: string | null
  source_grid: string | null
  dimension_type: DimensionType | null
  confidence: ConfidenceLevel | null
  flags: string[]
  is_allowance: boolean
  is_deleted: boolean
  is_manual_override: boolean
  sort_order: number
}

export interface Trade {
  id: string
  estimate_id: string
  trade_name: string
  trade_status: TradeStatus
  sort_order: number
  labor_rate_override: number | null
  ai_blended_labor_rate: number | null
  // Derived in the store after hydrate(); the type still declares them
  // because the store always populates them before render.
  line_item_ids: string[]
  subtotal: number
  flag_count: number
  worst_confidence: ConfidenceLevel | null
}

export interface EstimateConfig {
  overhead_pct: number
  profit_pct: number
  contingency_pct: number
  gc_sub_markup_pct: number
}

export interface Estimate {
  id: string
  job_id: string
  version: number
  review_status: ReviewStatus
  config: EstimateConfig
  direct_cost: number
  grand_total: number
  trade_ids: string[]
  flag_count: number
  created_at: string
  updated_at: string
  approved_by: string | null
  approved_at: string | null
}

export interface Job {
  id: string
  name: string
  client_name: string | null
  address: string | null
  bid_due_date: string | null
  project_type: string | null
}

export interface EstimateBundle {
  estimate: Estimate
  job: Job
  trades: Trade[]
  line_items: LineItem[]
}

// Row shape returned by `listEstimatesForDashboard` — a flattened estimate
// plus the joined job summary used by the dashboard list view.
export interface DashboardEstimateRow {
  id: string
  job_id: string
  version: number
  review_status: ReviewStatus
  direct_cost: number
  grand_total: number
  updated_at: string
  job: {
    id: string
    name: string
    client_name: string | null
    bid_due_date: string | null
    project_type: string | null
  } | null
}
