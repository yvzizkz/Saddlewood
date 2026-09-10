import { z } from 'zod'

// The progress payment tracker: the schedule-of-values workbook Saddlewood
// sends the owners of a residential job at each draw. One JSON document per
// job holds everything the workbook is built from. The same shape is read by
// build_tracker.py in the Powell Progress folder, so keep it stable
// (schemaVersion bumps when it changes).

export const TRACKER_SCHEMA_VERSION = 1

export type TrackerLine = {
  id: string
  name: string
  /** Original quoted contract amount (column B). */
  contract: number
  /** Net change orders, negative for savings (column C). */
  changeOrder: number
  /** Value of work completed and already invoiced before this invoice. */
  completedPrior: number
  /** Work completed this period, billed on this invoice. */
  thisInvoice: number
  /** Advance draw (mobilization) billed on this invoice, not yet earned. */
  draw: number
  /** Pricing pending: the line shows TBD and cannot be billed. */
  tbd: boolean
  /** Free text appended to the description on the workbook. */
  note: string
}

export type TrackerPayment = { label: string; date: string; amount: number }

export type PreviousInvoiceItemKind = 'progress' | 'draw' | 'change order'

export type PreviousInvoice = {
  number: string
  /** What the previous invoice billed. */
  total: number
  /** What the owner actually paid (defaults to total). */
  paid?: number
  paidDate: string
  items: { name: string; amount: number; kind: PreviousInvoiceItemKind }[]
}

export type TrackerState = {
  schemaVersion: number
  project: { name: string; contractor: string; owners: string; address: string; invoicePrefix?: string }
  invoice: { number: string; date: string; status: 'draft' | 'issued'; issuedAt?: string }
  previousInvoice?: PreviousInvoice | null
  payments: TrackerPayment[]
  lines: TrackerLine[]
  pendingChangeOrders: string[]
  notes: { mode: 'auto' | 'custom'; text: string }
  meta: { updatedAt: string; updatedBy: string }
}

const money = z.number().finite()
const nonNeg = z.number().finite().min(0)
const shortText = (max: number) => z.string().max(max)

export const trackerLineSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'line id must be lowercase letters, digits, and dashes'),
  name: z.string().trim().min(1).max(120),
  contract: money,
  changeOrder: money,
  completedPrior: nonNeg,
  thisInvoice: nonNeg,
  draw: nonNeg,
  tbd: z.boolean(),
  note: shortText(240),
})

export const trackerPaymentSchema = z.object({
  label: shortText(160),
  date: shortText(24),
  amount: money,
})

export const previousInvoiceSchema = z.object({
  number: shortText(32),
  total: money,
  paid: money.optional(),
  paidDate: shortText(24),
  items: z
    .array(
      z.object({
        name: shortText(120),
        amount: money,
        kind: z.enum(['progress', 'draw', 'change order']),
      }),
    )
    .max(200),
})

export const trackerStateSchema = z.object({
  schemaVersion: z.literal(TRACKER_SCHEMA_VERSION),
  project: z.object({
    name: z.string().trim().min(1).max(120),
    contractor: shortText(120),
    owners: shortText(160),
    address: shortText(200),
    invoicePrefix: shortText(32).optional(),
  }),
  invoice: z.object({
    number: z.string().trim().min(1).max(32),
    date: shortText(24),
    status: z.enum(['draft', 'issued']),
    issuedAt: z.string().max(40).optional(),
  }),
  previousInvoice: previousInvoiceSchema.nullable().optional(),
  payments: z.array(trackerPaymentSchema).max(200),
  lines: z.array(trackerLineSchema).min(1).max(200),
  pendingChangeOrders: z.array(shortText(160)).max(40),
  notes: z.object({ mode: z.enum(['auto', 'custom']), text: shortText(8000) }),
  meta: z.object({ updatedAt: shortText(40), updatedBy: shortText(120) }),
})

export type TrackerInvoiceSnapshot = {
  id: number
  trackerId: string
  invoiceNumber: string
  invoiceDate: string
  totalDue: number
  /** issued = generated (and usually emailed) from the portal; superseded = the numbers were recorded at payment time without a fresh generation. */
  status: 'issued' | 'superseded'
  generatedBy: string
  sentTo: string | null
  emailId: string | null
  createdAt: string
  generatedAt: string
}

export type TrackerRecord = {
  id: string
  projectName: string
  invoiceNumber: string
  state: TrackerState
  updatedBy: string
  updatedAt: string
  createdAt: string
}

export type TrackerListRow = Omit<TrackerRecord, 'state'> & { totalDue: number; percentComplete: number }

/** Body of PUT /api/trackers/[id]. */
export const saveTrackerSchema = z.object({
  state: trackerStateSchema,
  /** updated_at the client last saw; a mismatch is a 409 with the current row. */
  baseUpdatedAt: z.string().max(40).optional(),
})

/** Body of POST /api/trackers/[id]/generate. */
export const generateSchema = z.object({
  state: trackerStateSchema.optional(),
  baseUpdatedAt: z.string().max(40).optional(),
  /** Email the workbook (default true). false = just build, snapshot, and return the file link. */
  send: z.boolean().default(true),
  /** Extra allowlisted recipient(s). The acting person always receives it. */
  to: z.array(z.string().trim().email()).max(3).optional(),
  /** Skip the "$0 due" and over-billing guards. */
  force: z.boolean().default(false),
})

/** Body of POST /api/trackers/[id]/roll-forward. */
export const rollForwardSchema = z.object({
  amount: z.number().finite().positive(),
  date: z.string().trim().min(1).max(24),
  label: z.string().trim().min(1).max(160),
  baseUpdatedAt: z.string().max(40).optional(),
})
