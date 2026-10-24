import { NextResponse, type NextRequest } from "next/server";

import type { BillingDocument } from "@/lib/billing/types";
import { workSeat } from "@/lib/jobs/access";
import { getJobRef } from "@/lib/jobs/hub";
import { authorizeOps } from "@/lib/ops/auth";

import { clientSignature } from "./store";

// What the job's agreement routes share (/api/jobs/<id>/agreement and its
// /issue): who may call them, the job's billing side, and what staff see.

/** Owners signed in, or the Mac's token. */
export async function agreementCaller(request: NextRequest): Promise<{ actor: string } | NextResponse> {
  const who = await authorizeOps(request);
  if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (who.via === "token") return { actor: who.actor };
  const seat = await workSeat();
  if (!seat?.owner) return NextResponse.json({ ok: false, error: "agreements are for the owners" }, { status: 403 });
  return { actor: who.actor };
}

/** The billing id of the job a route names, or the answer to give. */
export async function billingJob(key: string): Promise<string | NextResponse> {
  const ref = await getJobRef(key);
  if (!ref) return NextResponse.json({ ok: false, error: "no such job" }, { status: 404 });
  if (!ref.billingId) return NextResponse.json({ ok: false, error: "This job has no billing side yet." }, { status: 404 });
  return ref.billingId;
}

/**
 * What staff see of it: the words, the price, where they came from. An issued
 * one adds its client link, for staff to pass on themselves (nothing here
 * sends it), and the client's signature once there is one.
 */
export async function shownAgreement(doc: BillingDocument | null) {
  if (!doc) return null;
  const a = doc.snapshot.agreement;
  const sig = doc.status === "draft" ? null : await clientSignature(doc.id);
  return {
    id: doc.id,
    number: doc.number,
    revision: doc.revision,
    status: doc.status,
    title: doc.title,
    totalCents: doc.totalCents,
    type: a?.type ?? null,
    text: a?.text ?? "",
    proposal: a?.proposal ?? null,
    link: doc.status === "issued" && doc.token ? `/d/${doc.token}` : null,
    signed: sig ? { name: sig.name, at: sig.at, method: sig.method } : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
  };
}
