import { notFound, redirect } from "next/navigation";

import { EstimateBuilder } from "@/components/sales/builder/EstimateBuilder";
import { salesSeatForPage } from "@/lib/sales/seat";
import { loadSettings } from "@/lib/sales/settingsStore";

export const dynamic = "force-dynamic";

// The estimate builder: whoever may open the pipeline (its costs and markups are on it).

export default async function EstimatePage({ params }: { params: Promise<{ eid: string }> }) {
  if (!(await salesSeatForPage(await loadSettings()))) redirect("/app");
  const { eid } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(eid)) notFound();
  return <EstimateBuilder estimateId={eid} />;
}
