import { redirect } from "next/navigation";

import BillScreen from "@/components/money/BillScreen";
import { getViewer } from "@/lib/crew/auth";

export const dynamic = "force-dynamic";

// Bill: Joist invoices in, the client pages and one email out, from a phone.
// Staff reach the page; everything on it answers to /api/billing/bill, which
// is for the owners (billing is owners only, decision 2026-10-12).

export default async function BillPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  if ((await getViewer()).kind !== "staff") redirect("/app");
  const { group } = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-5">
      <BillScreen initialGroupId={typeof group === "string" && /^[0-9a-f-]{36}$/i.test(group) ? group : null} />
    </main>
  );
}
