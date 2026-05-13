# Phase 6 — Client Portal + Legal Acceptance Flow

**Status:** Pending execution
**Target project:** Saddlewood Contracting LLC — internal estimate review portal
**Stack:** Next.js 16.1.6 (App Router), React 19, TypeScript strict, Tailwind CSS v4, Supabase

---

## 1. Phase Goal

Build the public-facing `/share/[token]` client portal page that renders estimate data in one of five output formats, records email verification on page load, and captures legally defensible client acceptance via a bottom-sheet panel backed by a server API route. After Phase 6 Marco can send a share link to any client, the client can read the estimate on their phone, and tap to legally accept — with audit records written to Supabase and notifications sent to both parties via Resend.

---

## 2. Success Criteria

- [ ] `npm run build` exits 0, no TypeScript errors, no `any` escapes added
- [ ] `GET /share/[valid-token]` renders the estimate view with no auth — works in an incognito window
- [ ] Page renders correctly on iPhone 14 viewport (390×844) — sticky Accept button never obscures content
- [ ] All 5 output formats render without errors: `detailed`, `trade_summary`, `summary`, `unit_price_schedule`, `allowance_schedule`
- [ ] No internal data visible to client: no confidence levels, no AI source citations, no flags/RFI notes, no cost breakdowns except in `detailed` format
- [ ] Page load records `email_verified_at = now()` on `export_links` row if previously null — confirmed via Supabase table viewer
- [ ] `GET /share/expired-token` shows the expired estimate page (not a 404, not a 500)
- [ ] `GET /share/already-accepted-token` shows the already-accepted confirmation page
- [ ] Accept button is disabled (grey) until name ≥ 2 chars AND checkbox is checked
- [ ] `POST /api/share/[token]/accept` with valid payload creates `acceptance_records` row, updates `export_links.accepted_at`, updates `estimates.review_status = 'accepted'`
- [ ] Resend fires `estimate-accepted` email to marco@saddlewoodcontracting.com after acceptance
- [ ] Resend fires `client-accepted-confirmation` email to client's email after acceptance
- [ ] "Ask a question" form sends email to info@saddlewoodcontracting.com — no Supabase write
- [ ] "Download PDF" button serves the PDF from Supabase Storage (or triggers generation fallback)
- [ ] `<meta name="robots" content="noindex,nofollow">` present on all `/share/*` pages
- [ ] Page `<title>` is generic ("Estimate — Saddlewood Contracting"), not the client/project name
- [ ] Acceptance API rejects expired tokens, revoked tokens, unverified emails, and duplicate accepts — each returns the correct HTTP status and message

---

## 3. Database Additions

### 3a. `acceptance_records` table

Run in Supabase SQL Editor BEFORE writing any app code.

```sql
CREATE TABLE acceptance_records (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id         UUID        NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
  export_link_id      UUID        NOT NULL REFERENCES export_links(id) ON DELETE RESTRICT,
  acceptor_name       TEXT        NOT NULL CHECK (char_length(acceptor_name) >= 2),
  acceptor_email      TEXT        NOT NULL,
  ip_address          TEXT,
  user_agent          TEXT,
  verification_method TEXT        NOT NULL DEFAULT 'link_click',
  pdf_snapshot_path   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_acceptance_records_estimate_id   ON acceptance_records(estimate_id);
CREATE INDEX idx_acceptance_records_export_link_id ON acceptance_records(export_link_id);

-- RLS: authenticated (Marco) can read all; anon cannot read (privacy)
ALTER TABLE acceptance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read acceptance_records"
  ON acceptance_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "service role insert acceptance_records"
  ON acceptance_records FOR INSERT
  TO service_role
  WITH CHECK (true);
```

### 3b. Additional fields needed on `export_links`

If not already present, add these columns:

```sql
ALTER TABLE export_links
  ADD COLUMN IF NOT EXISTS recipient_name  TEXT,
  ADD COLUMN IF NOT EXISTS recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_revoked      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_export_links_token ON export_links(token);
```

### 3c. RLS policy for public share page

The `anon` role must be able to read a single `export_links` row by token. Add if not already in Phase 1 schema:

```sql
CREATE POLICY "anon read export_links by token"
  ON export_links FOR SELECT
  TO anon
  USING (true);
-- Supabase anon key is safe here because the token itself is the secret.
-- No PII beyond what was intentionally shared is readable via this policy.
```

---

## 4. Server Component Design — `/share/[token]/page.tsx`

**File path:** `src/app/(portal)/share/[token]/page.tsx`

This is a **React Server Component**. All data fetching and token validation happens server-side. The client never sees raw Supabase calls or environment secrets.

### 4a. Data fetching sequence (runs on every page load)

```
1. Extract `token` from params
2. Query export_links WHERE token = $token  (use admin client — bypasses RLS for write)
3. If no row found → render <ExpiredPage reason="not_found" />
4. If row.is_revoked === true → render <ExpiredPage reason="revoked" />
5. If row.expires_at < now() → render <ExpiredPage reason="expired" expiresAt={row.expires_at} />
6. If row.accepted_at IS NOT NULL → render <AlreadyAcceptedPage record={acceptanceRecord} />
7. If row.email_verified_at IS NULL → UPDATE export_links SET email_verified_at = now() WHERE id = $id
   (fire-and-forget: do not block render on this, but await it before returning JSX)
8. Fetch estimate data:
   - estimates WHERE id = row.estimate_id
   - estimate_trades WHERE estimate_id = $estimate_id ORDER BY sort_order
   - estimate_line_items WHERE estimate_id = $estimate_id AND is_deleted = false ORDER BY sort_order
   - jobs WHERE id = estimate.job_id
9. Render <ClientPortalPage /> with all data as props (no client-side fetching needed)
```

### 4b. TypeScript interfaces

```typescript
// src/types/client-portal.ts

export interface ExportLinkRow {
  id: string;
  token: string;
  estimate_id: string;
  format: OutputFormat;
  expires_at: string;
  is_revoked: boolean;
  accepted_at: string | null;
  email_verified_at: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  pdf_storage_path: string | null;
  view_count: number;
}

export type OutputFormat =
  | 'detailed'
  | 'trade_summary'
  | 'summary'
  | 'unit_price_schedule'
  | 'allowance_schedule';

export interface ClientPortalProps {
  token: string;
  format: OutputFormat;
  job: JobRow;
  estimate: EstimateRow;
  trades: EstimateTradeRow[];
  lineItems: EstimateLineItemRow[];
  recipientName: string | null;
  recipientEmail: string;
  expiresAt: string;
  pdfStoragePath: string | null;
}

export interface JobRow {
  id: string;
  name: string;
  client_name: string;
  address: string;
}

export interface EstimateRow {
  id: string;
  job_id: string;
  grand_total: number;
  scope_narrative: string | null;
  assumptions: string[];       // JSON array stored as TEXT[] or JSONB
  exclusions: string[];
  review_status: string;
  overhead_percent: number;
  profit_percent: number;
  contingency_percent: number;
}

export interface EstimateTradeRow {
  id: string;
  estimate_id: string;
  trade_name: string;
  csi_division: string | null;
  subtotal: number;
  scope_bullets: string[];     // JSONB — 3-5 items for trade_summary format
  sort_order: number;
  status: 'SP' | 'SUB' | 'DEFERRED' | 'NIS';
}

export interface EstimateLineItemRow {
  id: string;
  estimate_id: string;
  trade_id: string;
  description: string;
  quantity: number;
  unit: string;
  material_unit_cost: number;
  labor_unit_cost: number;
  total: number;               // GENERATED ALWAYS AS column
  sort_order: number;
}
```

### 4c. Page component skeleton

```typescript
// src/app/(portal)/share/[token]/page.tsx

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ExpiredPage } from '@/components/client-portal/ExpiredPage';
import { AlreadyAcceptedPage } from '@/components/client-portal/AlreadyAcceptedPage';
import { ClientPortalPage } from '@/components/client-portal/ClientPortalPage';

// SEO: noindex all share pages
export const metadata: Metadata = {
  title: 'Estimate — Saddlewood Contracting',
  description: 'Estimate from Saddlewood Contracting',
  robots: { index: false, follow: false },
};

// Disable Next.js static generation — always dynamic (token state changes)
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: PageProps) {
  const { token } = await params;
  const supabase = createAdminClient();

  // 1. Fetch export link
  const { data: link, error } = await supabase
    .from('export_links')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !link) {
    return <ExpiredPage reason="not_found" />;
  }

  // 2. Validation checks
  if (link.is_revoked) {
    return <ExpiredPage reason="revoked" />;
  }

  if (new Date(link.expires_at) < new Date()) {
    return <ExpiredPage reason="expired" expiresAt={link.expires_at} />;
  }

  // 3. Already accepted
  if (link.accepted_at) {
    const { data: acceptanceRecord } = await supabase
      .from('acceptance_records')
      .select('*')
      .eq('export_link_id', link.id)
      .single();
    return <AlreadyAcceptedPage record={acceptanceRecord} jobName={''} />;
  }

  // 4. Record email verification (fire and await — prove link ownership)
  if (!link.email_verified_at) {
    await supabase
      .from('export_links')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', link.id);
  }

  // 5. Increment view count (fire-and-forget, non-blocking)
  supabase
    .from('export_links')
    .update({ view_count: (link.view_count ?? 0) + 1 })
    .eq('id', link.id)
    .then(() => {});

  // 6. Fetch estimate, trades, line items, job
  const [estimateResult, tradesResult, lineItemsResult] = await Promise.all([
    supabase
      .from('estimates')
      .select('*, jobs(*)')
      .eq('id', link.estimate_id)
      .single(),
    supabase
      .from('estimate_trades')
      .select('*')
      .eq('estimate_id', link.estimate_id)
      .eq('status', 'SP')               // Only SP (self-perform) trades visible to client
      .order('sort_order'),
    supabase
      .from('estimate_line_items')
      .select('*')
      .eq('estimate_id', link.estimate_id)
      .eq('is_deleted', false)
      .order('sort_order'),
  ]);

  if (!estimateResult.data) notFound();

  const { jobs: job, ...estimate } = estimateResult.data;

  return (
    <ClientPortalPage
      token={token}
      format={link.format}
      job={job}
      estimate={estimate}
      trades={tradesResult.data ?? []}
      lineItems={lineItemsResult.data ?? []}
      recipientName={link.recipient_name}
      recipientEmail={link.recipient_email ?? ''}
      expiresAt={link.expires_at}
      pdfStoragePath={link.pdf_storage_path}
    />
  );
}
```

---

## 5. Renderer Components — All 5 Output Formats

**File:** `src/components/client-portal/EstimateRenderer.tsx`

This is the top-level dispatcher. It receives the format and data, and renders the correct sub-component.

```typescript
// src/components/client-portal/EstimateRenderer.tsx

import { OutputFormat, EstimateRow, EstimateTradeRow, EstimateLineItemRow } from '@/types/client-portal';
import { DetailedRenderer } from './renderers/DetailedRenderer';
import { TradeSummaryRenderer } from './renderers/TradeSummaryRenderer';
import { SummaryRenderer } from './renderers/SummaryRenderer';
import { UnitPriceScheduleRenderer } from './renderers/UnitPriceScheduleRenderer';
import { AllowanceScheduleRenderer } from './renderers/AllowanceScheduleRenderer';

interface EstimateRendererProps {
  format: OutputFormat;
  estimate: EstimateRow;
  trades: EstimateTradeRow[];
  lineItems: EstimateLineItemRow[];
}

export function EstimateRenderer({ format, estimate, trades, lineItems }: EstimateRendererProps) {
  switch (format) {
    case 'detailed':
      return <DetailedRenderer estimate={estimate} trades={trades} lineItems={lineItems} />;
    case 'trade_summary':
      return <TradeSummaryRenderer estimate={estimate} trades={trades} />;
    case 'summary':
      return <SummaryRenderer estimate={estimate} />;
    case 'unit_price_schedule':
      return <UnitPriceScheduleRenderer estimate={estimate} trades={trades} />;
    case 'allowance_schedule':
      return <AllowanceScheduleRenderer estimate={estimate} trades={trades} />;
    default:
      return <TradeSummaryRenderer estimate={estimate} trades={trades} />;
  }
}
```

### 5a. Format 1: `DetailedRenderer` — Itemized by Trade

```typescript
// src/components/client-portal/renderers/DetailedRenderer.tsx
// Shows every line item grouped by trade. Columns: Description, Qty, Unit, Unit Price, Total.

interface DetailedRendererProps {
  estimate: EstimateRow;
  trades: EstimateTradeRow[];
  lineItems: EstimateLineItemRow[];
}

// Groups lineItems by trade_id, renders each trade as a collapsible section.
// On mobile: table collapses to card-per-line-item layout (Description + Total only visible,
// tap to expand for Qty/Unit/Unit Price).
// Desktop: full table with 5 columns.
// IMPORTANT: No confidence levels, AI citations, or internal flags shown.
```

### 5b. Format 2: `TradeSummaryRenderer` — Trade Sections with Lump Sum

```typescript
// src/components/client-portal/renderers/TradeSummaryRenderer.tsx
// One section per trade: 3-5 scope bullets + one trade total.
// Accordion: first trade expanded, rest collapsed.
// Each section header shows trade name + subtotal.
// Chevron rotates on expand/collapse.
```

### 5c. Format 3: `SummaryRenderer` — Single Total

```typescript
// src/components/client-portal/renderers/SummaryRenderer.tsx
// Renders estimate.scope_narrative as a paragraph.
// Shows grand total prominently.
// No trade breakdown, no line items.
```

### 5d. Format 4: `UnitPriceScheduleRenderer` — CSI Division Schedule

```typescript
// src/components/client-portal/renderers/UnitPriceScheduleRenderer.tsx
// Grouped by trade.csi_division (e.g., "09 20 00 — Plaster and Gypsum Board").
// Columns: Division Code | Description | Total.
// Subtotals per division. Grand total at bottom.
// Professional table layout, matches GC submittal format.
```

### 5e. Format 5: `AllowanceScheduleRenderer` — Scope + Exclusion Narrative

```typescript
// src/components/client-portal/renderers/AllowanceScheduleRenderer.tsx
// Two sections: "WHAT'S INCLUDED" (bulleted from scope_bullets) and
// "WHAT'S EXCLUDED" (from estimate.exclusions).
// Dollar totals only — no unit prices, no quantities.
// Bottom: total line "Base Scope Total: $X"
```

---

## 6. ASCII Wireframes

### 6a. Mobile Portal Page — `trade_summary` format (390px wide)

```
┌─────────────────────────────────────┐
│  [SW]  SADDLEWOOD CONTRACTING       │  ← logo left, teal background
│        AZ ROC-305762                │  ← tagline, cream text, smaller
├─────────────────────────────────────┤
│  ESTIMATE FOR BELLEVUE CHURCH       │  ← Fraunces, gold text
│  Prepared for: Westover Properties  │  ← Inter, charcoal
│  Date: May 13, 2026                 │  ← Inter, muted
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │      GRAND TOTAL            │    │  ← cream card, teal border-top 4px
│  │      $847,500               │    │  ← Fraunces 36px, gold
│  │  Valid through Jul 12, 2026 │    │  ← Inter 12px, muted charcoal
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│  SCOPE OF WORK                      │  ← section heading, teal, Fraunces
│  ─────────────────────────────────  │
│                                     │
│  ▼ FRAMING                $142,500  │  ← expanded, chevron down, gold amt
│  ┌─────────────────────────────┐    │
│  │  • Metal stud framing per   │    │  ← scope bullets, Inter 14px
│  │    structural drawings      │    │
│  │  • Headers & posts per      │    │
│  │    schedule H1-H22          │    │
│  │  • Soffit framing at all    │    │
│  │    ceiling transitions      │    │
│  └─────────────────────────────┘    │
│                                     │
│  ▶ DRYWALL                 $89,200  │  ← collapsed, chevron right
│  ▶ INSULATION              $34,100  │
│  ▶ ROUGH CARPENTRY         $18,400  │
│  [+ 3 more sections]                │  ← NIS/DEFERRED trades hidden
│                                     │
├─────────────────────────────────────┤
│  ASSUMPTIONS & CLARIFICATIONS       │
│  ────────────────────────────────   │
│  1. Pricing based on drawings       │
│     dated 04/01/2026                │
│  2. Owner-furnished materials not   │
│     included in this scope          │
│  3. Hazmat abatement by others      │
├─────────────────────────────────────┤
│  EXCLUSIONS                         │
│  ────────────────────────────────   │
│  • Permit fees                      │
│  • FF&E                             │
│  • MEP rough-in and finishes        │
│  • Exterior work of any kind        │
├─────────────────────────────────────┤
│  QUESTIONS?                         │
│  Marco Viramontes · (480) 999-6100  │
│                                     │
│  ┌──────────────┐  ┌─────────────┐  │
│  │ DOWNLOAD PDF │  │ ASK A       │  │
│  │              │  │ QUESTION    │  │
│  └──────────────┘  └─────────────┘  │
├─────────────────────────────────────┤
│  Expires in 60 days · Jul 12, 2026  │  ← muted footer text
└─────────────────────────────────────┘

═══════════════════════════════════════
│      ✓  ACCEPT THIS ESTIMATE       │  ← STICKY BOTTOM, fixed, gold bg
═══════════════════════════════════════
```

### 6b. Mobile Portal Page — `detailed` (Itemized) format

```
┌─────────────────────────────────────┐
│  [SW]  SADDLEWOOD CONTRACTING       │
│        AZ ROC-305762                │
├─────────────────────────────────────┤
│  ESTIMATE FOR BELLEVUE CHURCH       │
│  Prepared for: Westover Properties  │
│  Date: May 13, 2026                 │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │  GRAND TOTAL    $847,500    │    │
│  │  Valid through Jul 12, 2026 │    │
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│  SCOPE OF WORK — ITEMIZED           │
│                                     │
│  ▼ FRAMING                $142,500  │  ← collapsible trade section
│  ┌─────────────────────────────┐    │
│  │ Desc           Qty  U  Tot  │    │  ← compact table header
│  │ ─────────────────────────── │
│  │ LGS 3-5/8" 20ga 1,240 LF  $18,600│
│  │ LGS 6" 20ga    880  LF  $14,300 │
│  │ H1 Header   2   EA   $840  │    │
│  │ [8 more items...]           │    │
│  │ ──────────────────────────  │
│  │ Trade Total:        $142,500│    │
│  └─────────────────────────────┘    │
│                                     │
│  ▶ DRYWALL                 $89,200  │
│  ▶ INSULATION              $34,100  │
│                                     │
├─────────────────────────────────────┤
│  [ASSUMPTIONS / EXCLUSIONS / etc.]  │
└─────────────────────────────────────┘

═══════════════════════════════════════
│      ✓  ACCEPT THIS ESTIMATE       │
═══════════════════════════════════════

Mobile table note: On viewports < 480px, the line-item table renders as
stacked cards instead of a horizontal table to prevent horizontal scroll.
Each card: Description (full width) + row of Qty | Unit | Total.
```

### 6c. Sticky Accept Button Scroll Behavior

```
SCROLL POSITION: TOP
┌─────────────────────────────────────┐
│  [Header / Logo]                    │
│  [Grand Total Card]                 │
│  ...content...                      │
│                                     │
│                                     │
│─────────────────────────────────────│ ← viewport bottom
│ ✓  ACCEPT THIS ESTIMATE            │ ← z-index: 50, fixed bottom-0
└─────────────────────────────────────┘

SCROLL POSITION: MIDDLE
┌─────────────────────────────────────┐
│  ...trade sections...               │
│  ...assumptions...                  │
│                                     │
│                                     │
│                                     │
│─────────────────────────────────────│ ← viewport bottom
│ ✓  ACCEPT THIS ESTIMATE            │ ← STILL FIXED, always visible
└─────────────────────────────────────┘

SCROLL POSITION: BOTTOM
┌─────────────────────────────────────┐
│  ...exclusions...                   │
│  [DOWNLOAD PDF] [ASK A QUESTION]    │
│  Expires in 60 days · Jul 12, 2026  │
│                                     │  ← pb-20 ensures content not hidden
│─────────────────────────────────────│ ← viewport bottom
│ ✓  ACCEPT THIS ESTIMATE            │ ← z-index: 50, fixed bottom-0
└─────────────────────────────────────┘

Implementation: The page wrapper gets `pb-20` (80px padding-bottom) so the
last content section is never hidden behind the fixed button bar.
The button bar is: `fixed bottom-0 left-0 right-0 z-50 p-4 bg-white/95 backdrop-blur`
```

### 6d. Acceptance Bottom Sheet

```
BEFORE TAP (sheet hidden):
┌─────────────────────────────────────┐
│  ...estimate content...             │
│─────────────────────────────────────│
│ ✓  ACCEPT THIS ESTIMATE            │  ← gold, teal text, pulse animation
└─────────────────────────────────────┘

AFTER TAP (sheet slides up, 75% viewport height):
┌─────────────────────────────────────┐
│  ...blurred / dimmed estimate...    │
│                                     │
├─────────────────────────────────────┤  ← sheet slides up from bottom
│  ACCEPT THIS ESTIMATE               │  ← Fraunces, teal
│  ─────────────────────────────────  │
│  Bellevue Church                    │  ← Inter, charcoal
│  $847,500                           │  ← Fraunces, gold
│                                     │
│  By signing below, you confirm      │
│  you've reviewed and agree to this  │  ← Inter 14px, charcoal/70
│  estimate. This creates a binding   │
│  agreement under Arizona law.       │
│                                     │
│  YOUR FULL LEGAL NAME               │  ← label, uppercase, Inter 11px
│  ┌─────────────────────────────┐    │
│  │ John Smith               │  │    │  ← input, autocomplete="name"
│  └─────────────────────────────┘    │
│                                     │
│  ☑ I agree to conduct this          │  ← checkbox (required)
│    transaction electronically       │
│                                     │
│  ┌─────────────────────────────┐    │
│  │   CONFIRM ACCEPTANCE        │    │  ← gold when enabled, grey when not
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │         CANCEL              │    │  ← outline, charcoal
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘

SUBMITTING STATE:
│  ┌─────────────────────────────┐    │
│  │   [spinner] CONFIRMING...   │    │  ← disabled, spinner inline
│  └─────────────────────────────┘    │
```

### 6e. Post-Acceptance Confirmation Page

```
┌─────────────────────────────────────┐
│  [SW]  SADDLEWOOD CONTRACTING       │  ← same header as portal
├─────────────────────────────────────┤
│                                     │
│         ┌───────────────┐           │
│         │               │           │
│         │       ✓       │           │  ← large check, teal circle, 64px
│         │               │           │
│         └───────────────┘           │
│                                     │
│      Estimate Accepted              │  ← Fraunces 28px, charcoal
│                                     │
│  Thank you, John.                   │  ← Inter 16px
│  We've received your acceptance     │
│  of the Bellevue Church estimate.   │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Amount:    $847,500        │    │  ← cream card
│  │  Accepted:  May 13, 2026    │    │
│  │             2:14 PM MST     │    │
│  │  Ref:       ACC-847F2C      │    │  ← first 6 chars of UUID
│  └─────────────────────────────┘    │
│                                     │
│  We'll be in touch soon to discuss  │
│  next steps and scheduling.         │
│                                     │
│  ┌─────────────────────────────┐    │
│  │   DOWNLOAD YOUR COPY        │    │  ← teal button
│  └─────────────────────────────┘    │
│                                     │
│  Questions? Call Marco:             │
│  (480) 999-6100                     │
│                                     │
│  ────────────────────────────────   │
│  Saddlewood Contracting · AZ        │
│  ROC-305762                         │
└─────────────────────────────────────┘
```

### 6f. Desktop Portal Page Layout (1280px wide)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [SW Logo]  SADDLEWOOD CONTRACTING LLC                 AZ ROC-305762     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ESTIMATE FOR BELLEVUE CHURCH                                            │
│  Prepared for: Westover Properties · Date: May 13, 2026                  │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  GRAND TOTAL: $847,500          Valid through July 12, 2026      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  SCOPE OF WORK                                                           │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  ▼ FRAMING ─────────────────────────────────────────────── $142,500     │
│    • Metal stud framing per structural drawings                          │
│    • Headers and posts per schedule H1-H22                               │
│    • Soffit framing at all ceiling transitions                           │
│                                                                          │
│  ▶ DRYWALL ──────────────────────────────────────────────── $89,200     │
│  ▶ INSULATION ───────────────────────────────────────────── $34,100     │
│  ▶ ROUGH CARPENTRY ──────────────────────────────────────── $18,400     │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  ASSUMPTIONS & CLARIFICATIONS          │  EXCLUSIONS                     │
│  1. Pricing based on drawings...       │  • Permit fees                  │
│  2. Owner-furnished materials...       │  • FF&E                         │
│  3. Hazmat by others...                │  • MEP rough-in                 │
├──────────────────────────────────────────────────────────────────────────┤
│  Questions? Marco Viramontes · (480) 999-6100                            │
│  [DOWNLOAD PDF]  [ASK A QUESTION]  [  ✓ ACCEPT THIS ESTIMATE  ]         │
│  Expires in 60 days · July 12, 2026                                      │
└──────────────────────────────────────────────────────────────────────────┘

Desktop note: On md+ breakpoints (≥768px), the sticky Accept button moves
FROM the fixed-bottom bar INTO an inline CTA in the footer section of the
page. The fixed bar only activates on mobile (< 768px).
Rationale: on desktop, the footer is always visible in the viewport
(or a short scroll away), so the fixed bar is unnecessary and visually
heavy. Detect via CSS only: `md:relative md:bg-transparent`.
```

---

## 7. Acceptance Panel Component Spec

**File:** `src/components/client-portal/AcceptancePanel.tsx`

This is a **Client Component** (`'use client'`).

### 7a. State Machine

```
IDLE
  ↓ (user taps "Accept This Estimate" button)
OPEN (sheet visible, form empty)
  ↓ (user types name < 2 chars OR checkbox unchecked)
FILLING_INVALID (form visible, Confirm button disabled/grey)
  ↓ (name ≥ 2 chars AND checkbox checked)
FILLING_VALID (form visible, Confirm button enabled/gold)
  ↓ (user taps Confirm)
SUBMITTING (spinner shown, all inputs disabled, button text "Confirming...")
  ↓ success (API returns { success: true, confirmationId })
CONFIRMED (sheet unmounts, page replaces with post-acceptance view)
  ↓ error (API returns error)
ERROR (error message shown inside sheet, form re-enabled, user can retry)
  ↓ (user taps Cancel OR taps backdrop)
IDLE (sheet closes)
```

### 7b. Component interface

```typescript
interface AcceptancePanelProps {
  token: string;
  jobName: string;
  grandTotal: number;
  expiresAt: string;
  recipientName: string | null;
}

type PanelState = 'idle' | 'open' | 'submitting' | 'confirmed' | 'error';

interface AcceptanceFormState {
  signerName: string;
  electronicConsent: boolean;
}
```

### 7c. Validation rules

| Field | Rule | Error shown |
|---|---|---|
| `signerName` | `trim().length >= 2` | No error shown (button just stays disabled) |
| `electronicConsent` | Must be `true` | No error shown (button just stays disabled) |

Confirm button is enabled ONLY when BOTH conditions are met simultaneously. No inline validation messages — the disabled state is the affordance.

### 7d. Submit handler

```typescript
async function handleConfirm() {
  setState('submitting');
  try {
    const res = await fetch(`/api/share/${token}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signerName: form.signerName.trim(),
        electronicConsent: form.electronicConsent,
      }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      setErrorMessage(error ?? 'Something went wrong. Please try again.');
      setState('error');
      return;
    }
    const { confirmationId } = await res.json();
    setConfirmationId(confirmationId);
    setState('confirmed');
    // Trigger full page replacement: router.replace(`/share/${token}/accepted`)
    // OR update parent state via onAccepted callback prop
  } catch {
    setErrorMessage('Network error. Please check your connection and try again.');
    setState('error');
  }
}
```

### 7e. Animation spec

- Sheet slides up from bottom: CSS `transform: translateY(0)` from `translateY(100%)`, duration 300ms, ease-out
- Backdrop: `bg-black/40 backdrop-blur-sm`, fades in 200ms
- Sheet handle bar: 4px × 32px rounded pill, `bg-stone-300`, centered at top of sheet
- Close on backdrop tap: add `onClick={closePanel}` to backdrop div
- Close on swipe-down: add touch event handler, if deltaY > 80px → close

### 7f. Accessibility

- Sheet has `role="dialog"` and `aria-modal="true"` and `aria-labelledby`
- Focus trap: on open, focus moves to name input
- Escape key closes panel (when not submitting)
- Confirm button has `aria-disabled` when in disabled state (not just `disabled` attr, which removes from tab order)

---

## 8. `POST /api/share/[token]/accept` Route Spec

**File:** `src/app/api/share/[token]/accept/route.ts`

### 8a. Full logic

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createAdminClient(); // service role — bypasses RLS

  // STEP 1: Parse and validate request body
  let body: { signerName: string; electronicConsent: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.signerName || body.signerName.trim().length < 2) {
    return NextResponse.json({ error: 'Full legal name required' }, { status: 400 });
  }
  if (!body.electronicConsent) {
    return NextResponse.json({ error: 'Electronic consent required' }, { status: 400 });
  }

  // STEP 2: Validate token
  const { data: link } = await supabase
    .from('export_links')
    .select('*')
    .eq('token', token)
    .single();

  if (!link) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }
  if (link.is_revoked) {
    return NextResponse.json({ error: 'This link has been revoked' }, { status: 410 });
  }
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This estimate link has expired' }, { status: 410 });
  }
  if (!link.email_verified_at) {
    // Should never happen (page load sets it), but defensive check
    return NextResponse.json({ error: 'Email not verified' }, { status: 403 });
  }

  // STEP 3: Idempotency — check if already accepted
  if (link.accepted_at) {
    const { data: existingRecord } = await supabase
      .from('acceptance_records')
      .select('id')
      .eq('export_link_id', link.id)
      .single();
    return NextResponse.json({
      success: true,
      confirmationId: existingRecord?.id ?? link.id,
      alreadyAccepted: true,
    }, { status: 200 });
  }

  // STEP 4: Collect metadata
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  const userAgent = request.headers.get('user-agent') ?? 'unknown';

  // STEP 5: Write acceptance_records row
  const { data: acceptanceRecord, error: insertError } = await supabase
    .from('acceptance_records')
    .insert({
      estimate_id: link.estimate_id,
      export_link_id: link.id,
      acceptor_name: body.signerName.trim(),
      acceptor_email: link.recipient_email,
      ip_address: ip,
      user_agent: userAgent,
      verification_method: 'link_click',
    })
    .select()
    .single();

  if (insertError || !acceptanceRecord) {
    console.error('acceptance_records insert failed:', insertError);
    return NextResponse.json({ error: 'Failed to record acceptance' }, { status: 500 });
  }

  // STEP 6: Update export_links.accepted_at
  await supabase
    .from('export_links')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', link.id);

  // STEP 7: Update estimates.review_status
  await supabase
    .from('estimates')
    .update({ review_status: 'accepted' })
    .eq('id', link.estimate_id);

  // STEP 8: Fire notifications (async — do not await, do not let failures block response)
  const jobName = await getJobName(supabase, link.estimate_id);
  const grandTotal = await getGrandTotal(supabase, link.estimate_id);

  Promise.all([
    sendEstimateAcceptedToMarco({
      jobName,
      grandTotal,
      acceptorName: body.signerName.trim(),
      acceptorEmail: link.recipient_email,
      acceptedAt: acceptanceRecord.created_at,
      confirmationId: acceptanceRecord.id,
    }),
    sendAcceptanceConfirmationToClient({
      recipientEmail: link.recipient_email,
      recipientName: link.recipient_name ?? body.signerName.trim(),
      jobName,
      grandTotal,
      acceptedAt: acceptanceRecord.created_at,
      confirmationId: acceptanceRecord.id,
    }),
  ]).catch((err) => {
    console.error('notification send failed (non-fatal):', err);
  });

  // STEP 9: Return success
  return NextResponse.json({
    success: true,
    confirmationId: acceptanceRecord.id,
  }, { status: 200 });
}
```

### 8b. Helper functions

```typescript
// src/lib/notifications/estimateAccepted.ts

export async function sendEstimateAcceptedToMarco(data: {
  jobName: string;
  grandTotal: number;
  acceptorName: string;
  acceptorEmail: string;
  acceptedAt: string;
  confirmationId: string;
}): Promise<void>

export async function sendAcceptanceConfirmationToClient(data: {
  recipientEmail: string;
  recipientName: string;
  jobName: string;
  grandTotal: number;
  acceptedAt: string;
  confirmationId: string;
}): Promise<void>
```

### 8c. HTTP status code reference

| Scenario | Status |
|---|---|
| Success (first acceptance) | 200 |
| Already accepted (idempotent) | 200 |
| Missing/invalid body | 400 |
| Token not found | 404 |
| Token expired or revoked | 410 |
| Email not verified | 403 |
| DB write failure | 500 |

---

## 9. Email Notification Templates

**File:** `src/lib/resend/templates/`

### 9a. `estimate-accepted` — to Marco

Subject: `Estimate Accepted — [Job Name] — $[Amount]`

```
SADDLEWOOD CONTRACTING — ESTIMATE ACCEPTED

Good news, Marco.

[Acceptor Name] has accepted the [Job Name] estimate.

  Amount:      $847,500
  Accepted by: John Smith <john@example.com>
  Date/Time:   May 13, 2026 at 2:14 PM MST
  Reference:   ACC-847F2C

This has been recorded in the portal. You can view the full acceptance
record at: [link to /internal/estimates/[id]]

Next steps: reach out to coordinate contract signing and project kick-off.

— Saddlewood Portal
```

### 9b. `client-accepted-confirmation` — to client

Subject: `Your Estimate Acceptance — [Job Name] — Saddlewood Contracting`

```
[Saddlewood Logo]

ESTIMATE ACCEPTANCE CONFIRMATION

Hi [Recipient Name],

Thank you for accepting the estimate for [Job Name].

  Project:     Bellevue Church
  Amount:      $847,500
  Accepted:    May 13, 2026 at 2:14 PM MST
  Reference:   ACC-847F2C

Please save this email for your records. This serves as confirmation
of your acceptance.

Marco Viramontes will be in touch shortly to discuss next steps and
project scheduling.

Questions? Call: (480) 999-6100
Email: info@saddlewoodcontracting.com

---
Saddlewood Contracting LLC
AZ Contractor License ROC-305762
```

---

## 10. PDF Download Implementation

**Button:** `src/components/client-portal/PdfDownloadButton.tsx` — Client Component

### Strategy (in priority order):

**Strategy A — Pre-generated PDF in Supabase Storage (use first)**

If `export_links.pdf_storage_path` is not null:
1. Client taps "Download PDF"
2. Component calls `GET /api/share/[token]/pdf`
3. API route fetches a signed URL from Supabase Storage (60-second expiry)
4. Returns `{ url: signedUrl }`
5. Component opens `window.open(url, '_blank')` — browser downloads directly

**Strategy B — On-demand server-side generation (fallback if pdf_storage_path is null)**

1. `GET /api/share/[token]/pdf` detects no pre-generated PDF
2. Server fetches estimate data
3. Renders the appropriate format to HTML (reuse renderer components via `renderToStaticMarkup`)
4. Calls puppeteer-core (already available on Vercel via `@sparticuz/chromium`) to print to PDF
5. Stores result in Supabase Storage → updates `export_links.pdf_storage_path`
6. Returns signed URL as in Strategy A

**API route:** `src/app/api/share/[token]/pdf/route.ts`

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // 1. Validate token (same validation as accept route)
  // 2. If pdf_storage_path: generate signed URL and redirect
  //    return NextResponse.redirect(signedUrl, 302);
  // 3. If no pdf_storage_path: trigger on-demand generation
  //    Generate PDF → upload to storage → update row → redirect to signed URL
}
```

**NPM packages needed:**
```bash
npm install @sparticuz/chromium puppeteer-core
```

**Vercel config note:** Add to `next.config.ts`:
```typescript
experimental: {
  serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
}
```

---

## 11. "Ask a Question" Flow

**Trigger:** Client taps "Ask a Question" button.

**Implementation:** Modal dialog (not a bottom sheet — distinct from Accept panel).

**File:** `src/components/client-portal/AskQuestionModal.tsx`

```typescript
interface AskQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  prefillName?: string;
  prefillEmail?: string;  // from export_links.recipient_email if known
  jobName: string;
}
```

**Form fields:**
- Name (text input, pre-filled if `recipientName` known)
- Email (email input, pre-filled if `recipientEmail` known)
- Message (textarea, min 10 chars, max 1000 chars)

**API route:** `POST /api/share/[token]/question`

```typescript
// src/app/api/share/[token]/question/route.ts
// 1. Validate token (not expired, not revoked)
// 2. Validate body: { name, email, message }
// 3. Send ONE email via Resend to info@saddlewoodcontracting.com
//    Subject: "Question re: [Job Name] — [Client Name]"
//    Body: include client name, email, message, and the share URL
// 4. NO Supabase write needed
// 5. Return { success: true }
```

**Success state:** Modal shows "Your message has been sent. Marco will be in touch soon." with a close button.

**No rate limiting initially** — add if spam becomes an issue. The token requirement is enough friction.

---

## 12. Expired Estimate Page

**File:** `src/components/client-portal/ExpiredPage.tsx`

```typescript
interface ExpiredPageProps {
  reason: 'expired' | 'revoked' | 'not_found';
  expiresAt?: string; // only provided when reason === 'expired'
}
```

### Wireframe:

```
┌─────────────────────────────────────┐
│  [SW]  SADDLEWOOD CONTRACTING       │
├─────────────────────────────────────┤
│                                     │
│           ⏱                         │  ← clock icon, muted teal, 48px
│                                     │
│  This estimate link has expired     │  ← Fraunces 22px, charcoal
│                                     │
│  This link was valid for 60 days    │
│  and has since expired.             │  ← Inter 14px, charcoal/70
│                                     │
│  If you'd like to discuss this      │
│  project, please reach out to us    │
│  directly:                          │
│                                     │
│  Marco Viramontes                   │
│  (480) 999-6100                     │
│  info@saddlewoodcontracting.com     │
│                                     │
└─────────────────────────────────────┘
```

- reason `'revoked'` → "This estimate link is no longer active." (don't explain why)
- reason `'not_found'` → "This link doesn't appear to be valid. Please check your email for the correct link."
- No sticky Accept button on expired/not_found pages
- No `<meta noindex>` needed (token in URL is already the gate)

---

## 13. Already-Accepted Page

**File:** `src/components/client-portal/AlreadyAcceptedPage.tsx`

```typescript
interface AlreadyAcceptedPageProps {
  record: AcceptanceRecordRow | null;
  jobName: string;
}
```

### Wireframe:

```
┌─────────────────────────────────────┐
│  [SW]  SADDLEWOOD CONTRACTING       │
├─────────────────────────────────────┤
│                                     │
│          ✓                          │  ← same check as post-acceptance
│                                     │
│  Estimate Already Accepted          │  ← Fraunces 22px
│                                     │
│  This estimate was previously       │
│  accepted on May 13, 2026.          │  ← formatted from record.created_at
│                                     │
│  Reference: ACC-847F2C             │
│                                     │
│  Questions? Call Marco:             │
│  (480) 999-6100                     │
│                                     │
│  [DOWNLOAD YOUR COPY]               │
└─────────────────────────────────────┘
```

- No Accept button shown
- "Download Your Copy" still available if `pdf_storage_path` is set
- If `record` is null (race condition), show generic "This estimate has been accepted" message without reference number

---

## 14. SEO and Meta Considerations

All pages under `/share/*` MUST have:

```typescript
export const metadata: Metadata = {
  title: 'Estimate — Saddlewood Contracting',
  description: 'Estimate from Saddlewood Contracting',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  openGraph: undefined, // no OG tags — prevent link preview scrapers from caching content
};
```

**Reasons:**
1. Client proposals are confidential — Google should not index them
2. `noindex` prevents cached copies showing up in search results after the link expires
3. No Open Graph tags prevents Slack/WhatsApp/iMessage link previews from showing estimate amounts
4. The token in the URL is already security-by-obscurity, but `noindex` is defense in depth

**`robots.txt`** — confirm `/share/` is disallowed:
```
User-agent: *
Disallow: /share/
Disallow: /internal/
Disallow: /api/
Allow: /
```

---

## 15. Legal / Compliance — Arizona Electronic Acceptance

**What makes this legally defensible in Arizona:**

Arizona has adopted the Uniform Electronic Transactions Act (UETA) (A.R.S. § 44-7001 et seq.). Under UETA, an electronic signature is enforceable when:

1. **Intent to sign** — Met by the client typing their full legal name in the "Your Full Legal Name" field.
2. **Association with the record** — Met by recording `acceptor_name`, `acceptor_email`, `timestamp`, `ip_address`, and `user_agent` in `acceptance_records`.
3. **Consent to transact electronically** — Met by the required checkbox: "I agree to conduct this transaction electronically (required)."
4. **Identification** — Met by email verification: the client can only reach this page via the unique link sent to their email. `email_verified_at` proves they received the email at `recipient_email`.

**Audit trail stored in `acceptance_records`:**

| Field | Legal purpose |
|---|---|
| `acceptor_name` | Written signature equivalent |
| `acceptor_email` | Ties signature to the identified party |
| `ip_address` | Geographic/technical evidence |
| `user_agent` | Device/browser evidence |
| `verification_method: 'link_click'` | Proves email ownership |
| `created_at` | Timestamp of act |
| `export_link_id` | Links to the specific estimate version they saw |

**What this is NOT:** This is not a binding construction contract — it is a binding estimate acceptance / letter of intent. A formal AIA or custom contract should follow. The acceptance simply locks in the price and scope, preventing re-negotiation. Consult an Arizona attorney for the specific language in the acceptance disclaimer.

**PDF snapshot** (`pdf_snapshot_path`): When the acceptance is recorded, trigger a PDF generation of the estimate AS IT WAS AT THAT MOMENT and store the path. This is the document the client agreed to. Never regenerate this PDF if the estimate is later edited.

---

## 16. Testing Checklist

### Functional tests (run locally before deploying)

- [ ] Happy path: generate a real export link in DB → open on iPhone simulator → read estimate → tap Accept → fill form → confirm → verify `acceptance_records` row in Supabase table viewer
- [ ] Token not found: navigate to `/share/totally-fake-token` → see ExpiredPage with `not_found` reason
- [ ] Expired token: set `expires_at` to yesterday in DB → load page → see ExpiredPage with `expired` reason
- [ ] Revoked token: set `is_revoked = true` in DB → load page → see ExpiredPage with `revoked` reason
- [ ] Already accepted: load the same link after accepting → see AlreadyAcceptedPage
- [ ] Duplicate POST: submit acceptance twice via curl → second call returns `alreadyAccepted: true`, no duplicate `acceptance_records` rows
- [ ] Name validation: confirm button stays grey with 1-character name, enabled with 2
- [ ] Checkbox validation: confirm button stays grey with unchecked box even if name is valid
- [ ] All 5 formats render: create export links with each format → verify no JS errors, no visible internal data
- [ ] "Ask a Question" form: submit → verify email arrives at info@saddlewoodcontracting.com
- [ ] PDF download: with `pdf_storage_path` set → verify file downloads. With null → verify on-demand generation runs
- [ ] `<meta robots>` tag: inspect page source on Chrome DevTools → confirm `noindex,nofollow` present
- [ ] `robots.txt`: verify `/share/` is disallowed at `saddlewoodcontracting.com/robots.txt`

### Device tests (run on real hardware)

- [ ] **iPhone 14 Safari** — most important. Test sticky button does not obscure content. Test bottom sheet slides up correctly. Test form inputs auto-capitalize name field. Test PDF download opens correctly.
- [ ] **Samsung Galaxy Android Chrome** — test bottom sheet, form inputs, PDF download
- [ ] **iPad Safari** — verify layout does not break at tablet width (use desktop layout at 768px+)
- [ ] **Desktop Chrome** — verify desktop layout, Accept button moves to footer inline
- [ ] **Desktop Safari** — same as Chrome but verify any CSS differences

### Edge cases

- [ ] Load page with JavaScript disabled → ensure page renders (it's an RSC, should work). Accept button will not work — acceptable.
- [ ] Load page on slow 3G (throttle in DevTools) → verify loading state, no flash of unstyled content
- [ ] Concurrent accepts: send two simultaneous POST requests with the same token → verify only one `acceptance_records` row is created (the idempotency check in step 3 of the API route handles this; consider adding a DB-level unique constraint on `export_link_id`)

```sql
-- Add unique constraint to prevent duplicate acceptance records
ALTER TABLE acceptance_records
  ADD CONSTRAINT acceptance_records_export_link_id_unique
  UNIQUE (export_link_id);
```

---

## 17. File Structure — All New Files This Phase

```
src/
├── app/
│   ├── (portal)/
│   │   └── share/
│   │       └── [token]/
│   │           └── page.tsx                    ← SERVER COMPONENT (main)
│   └── api/
│       └── share/
│           └── [token]/
│               ├── accept/
│               │   └── route.ts                ← POST acceptance
│               ├── question/
│               │   └── route.ts                ← POST ask-a-question email
│               └── pdf/
│                   └── route.ts                ← GET PDF download
├── components/
│   └── client-portal/
│       ├── ClientPortalPage.tsx                ← top-level portal layout (Client Component for sticky button)
│       ├── PortalHeader.tsx                    ← logo + company header
│       ├── GrandTotalCard.tsx                  ← total + expiry
│       ├── EstimateRenderer.tsx                ← format dispatcher
│       ├── renderers/
│       │   ├── DetailedRenderer.tsx
│       │   ├── TradeSummaryRenderer.tsx
│       │   ├── SummaryRenderer.tsx
│       │   ├── UnitPriceScheduleRenderer.tsx
│       │   └── AllowanceScheduleRenderer.tsx
│       ├── AcceptancePanel.tsx                 ← bottom sheet (Client Component)
│       ├── AskQuestionModal.tsx                ← question form modal (Client Component)
│       ├── PdfDownloadButton.tsx               ← PDF download (Client Component)
│       ├── StickyAcceptBar.tsx                 ← fixed bottom bar (Client Component)
│       ├── ExpiredPage.tsx                     ← expired/revoked/not-found state
│       ├── AlreadyAcceptedPage.tsx             ← already accepted state
│       └── PostAcceptancePage.tsx              ← success state (shown after confirm)
├── lib/
│   └── resend/
│       └── templates/
│           ├── estimate-accepted.ts            ← email to Marco
│           └── client-accepted-confirmation.ts ← email to client
│       └── client-question.ts                  ← email template for ask-a-question
└── types/
    └── client-portal.ts                        ← all TypeScript interfaces
```

---

## 18. Implementation Order (within Phase 6)

Execute in this order to avoid unresolvable imports:

1. **DB migrations** — run `acceptance_records` table SQL + `export_links` column additions in Supabase
2. **`src/types/client-portal.ts`** — all interfaces, no dependencies
3. **`src/components/client-portal/ExpiredPage.tsx`** — pure UI, no data deps
4. **`src/components/client-portal/AlreadyAcceptedPage.tsx`** — pure UI
5. **`src/components/client-portal/PostAcceptancePage.tsx`** — pure UI
6. **All 5 renderers** — pure UI components, depend only on types
7. **`src/components/client-portal/EstimateRenderer.tsx`** — depends on renderers
8. **`src/components/client-portal/PortalHeader.tsx`** — pure UI
9. **`src/components/client-portal/GrandTotalCard.tsx`** — pure UI
10. **`src/components/client-portal/StickyAcceptBar.tsx`** — pure UI
11. **`src/components/client-portal/AcceptancePanel.tsx`** — Client Component, depends on StickyAcceptBar
12. **`src/components/client-portal/PdfDownloadButton.tsx`** — Client Component
13. **`src/components/client-portal/AskQuestionModal.tsx`** — Client Component
14. **`src/components/client-portal/ClientPortalPage.tsx`** — assembles all above
15. **`src/app/(portal)/share/[token]/page.tsx`** — Server Component, depends on all above
16. **`src/lib/resend/templates/estimate-accepted.ts`** — email template
17. **`src/lib/resend/templates/client-accepted-confirmation.ts`** — email template
18. **`src/lib/resend/client-question.ts`** — email template
19. **`src/app/api/share/[token]/accept/route.ts`** — depends on templates + admin client
20. **`src/app/api/share/[token]/question/route.ts`** — depends on question email template
21. **`src/app/api/share/[token]/pdf/route.ts`** — depends on admin client + storage
22. **`robots.txt`** — add `/share/` disallow if not already present
23. **End-to-end test** — generate a real token, walk the full acceptance flow

---

## 19. Open Questions / Decisions for Marco

These items require a decision before or during implementation:

| # | Question | Default assumption if not answered |
|---|---|---|
| 1 | What is Marco's full display name for the portal contact section? | "Marco Viramontes" |
| 2 | What is the phone number for the client-facing portal? | (480) 999-6100 |
| 3 | Should NIS/DEFERRED trades be hidden from the client entirely, or shown with "Not in scope" label? | Hidden entirely |
| 4 | Should the `detailed` format show unit prices, or only quantities and totals? | Show all: Qty, Unit, Unit Price, Total |
| 5 | How many days should export links be valid by default? | 60 days |
| 6 | Should the "Download PDF" button be available before acceptance, or only after? | Available before (client may want to print/share internally before deciding) |
| 7 | Should the acceptance disclaimer say "estimate" or "proposal"? | "estimate" |
| 8 | Is puppeteer-core on Vercel acceptable (adds cold start latency), or should PDF be pre-generated at send time? | Pre-generate at send time (Strategy A), puppeteer as fallback only |
