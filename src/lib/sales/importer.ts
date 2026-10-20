import { localId, newEstimateBody } from "./templates";
import type { EstimateBody, EstimateItem } from "./types";

// A takeoff the Mac pipeline produced (/estimate-auto, ingested into the
// estimates tables) as a builder estimate, so a bid priced from plans can be
// presented, given packages and sent from the app. Unit costs come across as
// they are: the pipeline's material prices already carry their waste (its
// flags say "material incl. 10% waste"), so waste here is 0 and the totals
// match the pipeline's.

type PipelineLine = {
  description: string;
  area_location: string | null;
  quantity: number | string;
  unit: string | null;
  material_unit_cost: number | string;
  labor_unit_cost: number | string;
  is_allowance: boolean;
  is_deleted: boolean;
  flags: string[] | null;
  source_sheet: string | null;
  confidence: string | null;
  sort_order: number;
};

export type PipelineEstimate = {
  id: string;
  overhead_pct: number | string;
  profit_pct: number | string;
  contingency_pct: number | string;
  gc_sub_markup_pct: number | string;
  jobs: { name: string; address: string | null } | null;
  estimate_trades: {
    id: string;
    trade_name: string;
    trade_status: "SP" | "SUB" | "DEFERRED" | "NIS";
    sort_order: number;
    estimate_line_items: PipelineLine[];
  }[];
};

const f = (v: number | string | null | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function fromPipeline(e: PipelineEstimate): { body: EstimateBody; title: string } {
  const title = e.jobs?.name ?? "Imported estimate";
  const body = newEstimateBody("blank", title);
  body.template = "pipeline";
  body.pricing = {
    ...body.pricing,
    overheadPct: f(e.overhead_pct),
    profitPct: f(e.profit_pct),
    contingencyPct: f(e.contingency_pct),
    subMarkupPct: f(e.gc_sub_markup_pct),
  };
  body.manifest = { basis: "pipeline", drawingSet: "", drawingDate: null, addenda: "", priorChecked: false };
  body.present = { ...body.present, layout: "sections", showPackages: false };

  const trades = [...e.estimate_trades].sort((a, b) => a.sort_order - b.sort_order).filter((t) => t.trade_status === "SP" || t.trade_status === "SUB");
  body.sections = trades.map((t) => ({
    id: localId("s"),
    name: t.trade_name,
    items: [...t.estimate_line_items]
      .filter((l) => !l.is_deleted)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l): EstimateItem => {
        const mat = f(l.material_unit_cost);
        const lab = f(l.labor_unit_cost);
        const memo = [l.source_sheet && `Sheet ${l.source_sheet}`, l.confidence && `confidence ${l.confidence}`, ...(l.flags ?? [])].filter(Boolean).join(" · ");
        const common = {
          id: localId(),
          description: l.area_location && !l.description.includes(l.area_location) ? `${l.description} (${l.area_location})` : l.description,
          memo: memo || undefined,
          qty: f(l.quantity),
          unit: (l.unit ?? "EA").toUpperCase(),
          wastePct: 0,
          hrs: 0,
          rate: null,
          priceDate: null,
          source: `pipeline estimate ${e.id.slice(0, 8)}`,
        };
        if (l.is_allowance) return { ...common, kind: "allowance", mat: 0, lab: 0, cost: mat + lab };
        if (t.trade_status === "SUB") return { ...common, kind: "sub", mat: 0, lab: 0, cost: mat + lab };
        if (mat > 0 && lab > 0) return { ...common, kind: "installed", mat, lab, cost: 0 };
        if (lab > 0) return { ...common, kind: "labor", mat: 0, lab, cost: 0 };
        return { ...common, kind: "material", mat, lab: 0, cost: 0 };
      }),
  }));
  return { body, title };
}
