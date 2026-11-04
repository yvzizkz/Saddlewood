import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isId } from "@/lib/billing/http";
import { addJobContact, CLIENT_KINDS, CONTACT_ROLES, createJobClient, JobClientError, setJobClient, setJobContact } from "@/lib/clients/jobClient";
import { jobForWrite, workSeat } from "@/lib/jobs/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Who the job is for. Owners only: the contact is where a client's details
// come from on this job, and a PM sees them read only on the job page.
//
//   PATCH { contactId }                          this client contact is the job's
//   PATCH { newContact: { name, email, phone, role } }   add a person to the client, and use them
//   PATCH { clientId }                           link a job with no client to one on file
//   PATCH { newClient: { name, kind } }          make the client record, and link it

const id = z.string().refine(isId, "not an id");
const bodySchema = z.union([
  z.object({ contactId: id }).strict(),
  z.object({ clientId: id }).strict(),
  z.object({ newClient: z.object({ name: z.string().trim().min(1).max(200), kind: z.enum(CLIENT_KINDS) }).strict() }).strict(),
  z
    .object({
      newContact: z
        .object({
          name: z.string().trim().max(200).default(""),
          email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(200)]).default(""),
          phone: z.string().trim().max(40).default(""),
          role: z.enum(CONTACT_ROLES).default("other"),
        })
        .strict()
        .refine((c) => c.name || c.email, "a contact needs a name or an email"),
    })
    .strict(),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const seat = await workSeat();
  if (!seat?.owner) return NextResponse.json({ ok: false, error: "owners only" }, { status: 403 });
  const ref = await jobForWrite(seat, (await params).id);
  if (!ref) return NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "Fill in a name or an email, and check the email." }, { status: 400 });
  const b = body.data;
  try {
    if ("contactId" in b) await setJobContact(ref, b.contactId);
    else if ("clientId" in b) await setJobClient(ref, b.clientId);
    else if ("newClient" in b) await createJobClient(ref, b.newClient, seat.email);
    else await addJobContact(ref, b.newContact);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof JobClientError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("job client:", err);
    return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
  }
}
