import { z } from "zod";

import { readSignatureInput } from "@/lib/sales/signing";
import type { PackageInput, SubInput } from "./store";
import { SUB_STATUSES } from "./types";

// What the screens and the sub's link may send, read strictly.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date");
const optDay = z.union([day, z.literal(""), z.null()]).transform((v) => (v ? v : null));
const text = (max: number) => z.string().max(max).default("");
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .refine((s) => s === "" || /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(s), "that email address does not look right");

export const subInputSchema = z.object({
  name: z.string().trim().min(2, "the company's name").max(160),
  trades: z.array(z.string().max(40)).max(20).default([]),
  status: z.enum(SUB_STATUSES).default("prospect"),
  phone: text(40),
  email: email.default(""),
  address: text(300),
  rocLicense: text(40),
  coiExpiresOn: optDay.default(null),
  w9OnFile: z.boolean().default(false),
  msaSignedOn: optDay.default(null),
  note: text(2000),
  rocVerified: z.boolean().optional(),
  achConfirmed: z.boolean().optional(),
  contacts: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: text(120),
        email: email.default(""),
        phone: text(40),
        role: text(60),
        isPrimary: z.boolean().default(false),
      }),
    )
    .max(20)
    .default([]),
});

export function readSubInput(raw: unknown): { ok: true; value: SubInput } | { ok: false; error: string } {
  const r = subInputSchema.safeParse(raw);
  return r.success ? { ok: true, value: r.data as SubInput } : { ok: false, error: r.error.issues[0]?.message ?? "check the sub" };
}

const lineSchema = z.object({
  id: z.string().max(64).default(""),
  description: z.string().max(300),
  qty: z.number().finite().nullable().default(null),
  unit: text(20),
  note: text(500),
  ourCents: z.number().int().min(0).max(10_000_000_000).nullable().default(null),
});

export const packageInputSchema = z
  .object({
    jobId: z.string().uuid().nullable().default(null),
    opportunityId: z.string().uuid().nullable().default(null),
    trade: z.string().trim().min(2, "the trade").max(40),
    title: z.string().trim().min(2, "a title").max(200),
    scope: text(8000),
    lines: z.array(lineSchema).max(200).default([]),
    exclusions: z.array(z.string().max(300)).max(50).default([]),
    workFrom: optDay.default(null),
    workTo: optDay.default(null),
    siteWalk: text(300),
    dueAt: z.string().datetime({ offset: true }).nullable().default(null),
    terms: text(8000),
  })
  .refine((p) => p.jobId || p.opportunityId, "a package belongs to a job or an opportunity")
  .refine((p) => !p.workFrom || !p.workTo || p.workFrom <= p.workTo, "the work window ends before it starts");

export function readPackageInput(raw: unknown): { ok: true; value: PackageInput } | { ok: false; error: string } {
  const r = packageInputSchema.safeParse(raw);
  return r.success ? { ok: true, value: r.data as PackageInput } : { ok: false, error: r.error.issues[0]?.message ?? "check the package" };
}

const fileRef = z.object({ path: z.string().min(3).max(400), name: z.string().trim().min(1).max(160), size: z.number().int().min(1).max(26_214_400), type: z.string().max(100) });

const bidSchema = z.object({
  lines: z.array(z.object({ lineId: z.string().max(64), cents: z.number().int().min(0).max(10_000_000_000).nullable(), note: text(500) })).max(200),
  inclusions: text(4000),
  exclusions: text(4000),
  startOn: optDay.default(null),
  duration: text(200),
  validDays: z.number().int().min(1).max(365).default(30),
  deviations: text(4000),
  note: text(2000),
  files: z.array(fileRef).max(10).default([]),
  signerTitle: text(80),
  signature: z.unknown(),
});

/** The sub's bid as sent from their link, with the signature checked the way client signatures are. */
export function readBid(raw: unknown) {
  const r = bidSchema.safeParse(raw);
  if (!r.success) return { ok: false as const, error: r.error.issues[0]?.message ?? "check the bid" };
  const sig = readSignatureInput(r.data.signature);
  if (!sig.ok) return { ok: false as const, error: sig.error };
  const { name, method, typed, font, image } = sig.value;
  return {
    ok: true as const,
    value: { ...r.data, signerName: name, signature: { method, typed, font, image } },
  };
}

export const UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  "application/zip",
] as const;

export const uploadSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.enum(UPLOAD_TYPES),
  size: z.number().int().min(1).max(26_214_400),
});
