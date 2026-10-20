import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId } from "@/lib/billing/http";
import { subsError, subsGate } from "@/lib/subs/access";
import { attachPackageFile, getPackage, removePackageFile, signSubsUpload, SUBS_BUCKET } from "@/lib/subs/store";
import { uploadSchema } from "@/lib/subs/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The package's files (plans, sheets, specs): POST for a one-time upload slot,
// PUT once the file is in storage to put it on the package, DELETE to take one off.

export async function POST(request: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const { pid } = await params;
  if (!isId(pid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "PDFs, pictures, spreadsheets and documents up to 25 MB" }, { status: 400 });
  try {
    if (!(await getPackage(pid))) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const slot = await signSubsUpload(`p/${pid}`, body.data.name);
    return NextResponse.json({ ok: true, bucket: SUBS_BUCKET, ...slot, file: { path: slot.path, ...body.data } });
  } catch (err) {
    return subsError(err, "prepare the upload");
  }
}

const attach = z.object({ path: z.string().max(400), name: z.string().trim().min(1).max(160), size: z.number().int().min(1), type: z.string().max(100) });

export async function PUT(request: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const { pid } = await params;
  if (!isId(pid)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const body = attach.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "check the file" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, package: await attachPackageFile(pid, body.data, gate.who.actor) });
  } catch (err) {
    return subsError(err, "add the file");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const gate = await subsGate(request, "manage");
  if (gate.response) return gate.response;
  const { pid } = await params;
  const fileId = request.nextUrl.searchParams.get("fileId") ?? "";
  if (!isId(pid) || !isId(fileId)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    return NextResponse.json({ ok: true, package: await removePackageFile(pid, fileId) });
  } catch (err) {
    return subsError(err, "remove the file");
  }
}
