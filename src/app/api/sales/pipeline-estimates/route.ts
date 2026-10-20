import { NextRequest, NextResponse } from "next/server";

import { authorizeSales, salesError } from "@/lib/sales/access";
import { listPipelineEstimates } from "@/lib/sales/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Takeoffs the Mac pipeline priced (estimates table), to start a builder estimate from.

export async function GET(request: NextRequest) {
  const gate = await authorizeSales(request);
  if (gate.response) return gate.response;
  try {
    return NextResponse.json({ ok: true, estimates: await listPipelineEstimates() });
  } catch (err) {
    return salesError(err, "list pipeline estimates");
  }
}
