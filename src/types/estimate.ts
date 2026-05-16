// Shared types for the pipeline → portal ingest path and downstream estimate UI.

export type TradeStatus = "SP" | "SUB" | "DEFERRED" | "NIS";
export type UnitType = "LF" | "SF" | "EA" | "LS";
export type DimensionType =
  | "written"
  | "scaled"
  | "schedule"
  | "calculated"
  | "assumed";
export type ConfidenceLevel = "high" | "medium" | "low";
export type ReviewStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "sent"
  | "archived"
  | "cancelled";

export interface IngestLineItem {
  description: string;
  area_location?: string | null;
  quantity: number;
  unit: UnitType;
  material_unit_cost: number;
  labor_unit_cost: number;
  labor_hours_per_unit?: number | null;
  dimension_type: DimensionType;
  source_sheet?: string | null;
  source_grid?: string | null;
  confidence: ConfidenceLevel;
  flags?: string[];
  is_allowance?: boolean;
}

export interface IngestTrade {
  trade_name: string;
  trade_status: TradeStatus;
  sort_order?: number;
  line_items: IngestLineItem[];
}

export interface IngestJob {
  name: string;
  client_name: string;
  address?: string | null;
  ahj?: string | null;
  bid_due_date?: string | null; // ISO date "YYYY-MM-DD"
  project_type?: string | null;
  gc_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
}

export interface IngestConfig {
  overhead_pct: number;
  profit_pct: number;
  contingency_pct: number;
  gc_sub_markup_pct: number;
}

export interface IngestPayload {
  pipeline_version: string;
  ingest_mode?: "new" | "revision"; // optional hint; portal versions regardless
  job: IngestJob;
  config: IngestConfig;
  trades: IngestTrade[];
}

export interface IngestSuccessResponse {
  success: true;
  estimateId: string;
  jobId: string;
  version: number;
  isRevision: boolean;
  previousEstimateId: string | null;
}

export interface IngestErrorResponse {
  success: false;
  error: string;
  code?: string;
}

// Frozen at ingest time, never mutated. Powers the AI baseline diff view.
export interface AiBaselineSnapshot {
  quantity: number;
  material_unit_cost: number;
  labor_unit_cost: number;
  labor_hours_per_unit?: number | null;
  confidence: ConfidenceLevel;
  flags: string[];
  dimension_type: DimensionType;
}
