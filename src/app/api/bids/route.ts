import { NextRequest, NextResponse } from "next/server";

import { isId } from "@/lib/billing/http";
import { loadPolicies } from "@/lib/policies/store";
import { subsError, subsGate } from "@/lib/subs/access";
import { defaultDue } from "@/lib/subs/rules";
import { createPackage, listInvites, listPackages, packageJob } from "@/lib/subs/store";
import { readPackageInput } from "@/lib/subs/validate";
import { localDay } from "@/lib/crew/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bid packages: the list (all, or one job's or opportunity's) and a new one.

export async function GET(request: NextRequest) {
  const gate = await subsGate(request);
  if (gate.response) return gate.response;
  const q = request.nextUrl.searchParams;
  const jobId = q.get("jobId");
  const opportunityId = q.get("opportunityId");
  if ((jobId && !isId(jobId)) || (opportunityId && !isId(opportunityId))) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const packages = await listPackages({ jobId: jobId ?? undefined, opportunityId: opportunityId ?? undefined });
    const invites = (await Promise.all(packages.map((p) => listInvites({ packageId: p.id })))).flat();
    const jobs = await Promise.all(packages.map((p) => packageJob(p)));
    const { values } = await loadPolicies();
    return NextResponse.json({
      ok: true,
      packages: packages.map((p, i) => {
        const mine = invites.filter((x) => x.packageId === p.id && x.status !== "withdrawn");
        return {
          id: p.id,
          title: p.title,
          trade: p.trade,
          status: p.status,
          dueAt: p.dueAt,
          job: jobs[i],
          jobId: p.jobId,
          opportunityId: p.opportunityId,
          invited: mine.length,
          bids: mine.filter((x) => x.status === "submitted" || x.status === "awarded" || x.status === "not_awarded").length,
          declined: mine.filter((x) => x.status === "declined").length,
          createdAt: p.createdAt,
        };
      }),
      can: gate.seat.can,
      defaultDue: defaultDue(localDay(), values),
    });
  } catch (err) {
    return subsError(err, "list the packages");
  }
}

export async function POST(request: NextRequest) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const input = readPackageInput(await request.json().catch(() => null));
  if (!input.ok) return NextResponse.json({ ok: false, error: input.error }, { status: 400 });
  try {
    if (!input.value.dueAt) input.value.dueAt = defaultDue(localDay(), (await loadPolicies()).values);
    return NextResponse.json({ ok: true, package: await createPackage(input.value, gate.who.actor) });
  } catch (err) {
    return subsError(err, "create the package");
  }
}
