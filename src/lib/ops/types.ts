import { z } from "zod";

export const OPS_COLUMNS = ["backlog", "drafting", "review", "live", "measured"] as const;
export type OpsColumn = (typeof OPS_COLUMNS)[number];

export const OPS_COLUMN_LABELS: Record<OpsColumn, string> = {
  backlog: "Backlog",
  drafting: "Drafting",
  review: "Owner review",
  live: "Live",
  measured: "Measured",
};

export const OPS_OWNERS = ["Marco", "Lando", "Ilene", "Eli"] as const;
export type OpsOwner = (typeof OPS_OWNERS)[number];

export type OpsCard = {
  id: string;
  title: string;
  owner: OpsOwner;
  col: OpsColumn;
  note: string;
  sort: number;
  updatedAt: string;
  updatedBy: string;
  archivedAt: string | null;
};

export type OpsEvent = {
  id: number;
  cardId: string;
  fromCol: OpsColumn | null;
  toCol: OpsColumn | null;
  actor: string;
  at: string;
};

const idSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "id must be lowercase letters, digits, and dashes");

export const createCardSchema = z.object({
  id: idSchema.optional(),
  title: z.string().trim().min(3).max(160),
  owner: z.enum(OPS_OWNERS).default("Lando"),
  col: z.enum(OPS_COLUMNS).default("backlog"),
  note: z.string().trim().max(500).default(""),
  sort: z.number().int().min(0).max(100000).optional(),
});
export type CreateCardInput = z.infer<typeof createCardSchema>;

export const patchCardSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    owner: z.enum(OPS_OWNERS).optional(),
    col: z.enum(OPS_COLUMNS).optional(),
    note: z.string().trim().max(500).optional(),
    sort: z.number().int().min(0).max(100000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to change" });
export type PatchCardInput = z.infer<typeof patchCardSchema>;

export function slugFromTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length >= 2 ? base : `card-${Date.now().toString(36)}`;
}
