---
name: Saddlewood Estimate Portal — Full Build Plan
description: Complete architecture and execution plan for the internal estimate review portal. All decisions locked. Use this to resume the build in any future session.
type: project
originSessionId: 271de9ef-5bd1-4b51-809e-80b684f6ab3a
---
# Saddlewood Estimate Portal — Execution Plan
**Captured: 2026-05-13 | Status: PLAN LOCKED — ready for execution**

---

## CONFIRMED DECISIONS (do not re-ask these)

| Decision | Answer |
|---|---|
| Marco's email (auth whitelist + user account) | marco@saddlewoodcontracting.com |
| From-address for outbound emails to clients | info@saddlewoodcontracting.com |
| Vercel plan | Pro ($20/mo) — already active |
| Route group refactor | Approved — move existing pages into `(marketing)/` |
| Joist integration | Manual copy for now. Revisit when/if Joist releases an API or if Saddlewood switches to Jobber (which has a real GraphQL API) |
| Pipeline → Portal handoff | Automatic push via HTTP POST at end of pipeline (after Verification Protocol passes) |
| Auth method | Supabase Auth — magic link (email OTP). No password. |
| Database | Supabase Postgres (project: rwzmcknxlucwbhsyxdcx.supabase.co) |
| Hosting | Vercel (existing repo: https://github.com/yvzizkz/Saddlewood) |
| State management | Zustand for the estimate editor; SWR for the dashboard list |
| PDF generation | Browser print-to-PDF via preview page (Phase 1). Server-side PDF in Phase 2 if needed. |

---

## REPO & INFRASTRUCTURE FACTS (confirmed from codebase read)

**GitHub repo**: https://github.com/yvzizkz/Saddlewood (public)
**Live site**: saddlewoodcontracting.com (already on Vercel Pro)
**Supabase project URL**: https://rwzmcknxlucwbhsyxdcx.supabase.co

**Current tech stack**:
- Next.js 16.1.6 (App Router), React 19.2.3, TypeScript 5.9.3 strict
- Tailwind CSS v4 — config lives in `src/app/globals.css` via `@theme inline`, NO tailwind.config.ts file
- Framer Motion 12.x, Lucide React icons
- No middleware.ts exists yet
- No auth packages installed
- No database packages installed
- No email library installed
- CRM: GoHighLevel via webhook (contact form only, not relevant to portal)

**Brand colors from globals.css** (use these in portal UI):
- Teal: #2d4a4a (primary brand color)
- Gold: #c8a55a
- Background/cream: #f5f0e8
- Charcoal: #2c2926
- Stone: #e2dbd0

**Path alias**: `@/` = `src/`

**Font**: Fraunces (Google Fonts, loaded via next/font, CSS var: `--font-fraunces`) + Inter (sans)

**Critical issue with root layout**: `src/app/layout.tsx` wraps EVERY page with `<Navbar>`, `<Footer>`, and the GHL chat widget. The portal must NOT have these. This is why the route group refactor is the first step — it gives the portal its own layout.

---

## ARCHITECTURE OVERVIEW

```
saddlewoodcontracting.com/
├── (marketing)/            ← existing public site — has Navbar, Footer, GHL chat
│   ├── layout.tsx          ← marketing shell
│   ├── page.tsx            ← homepage
│   ├── about/
│   ├── contact/
│   ├── portfolio/
│   ├── services/
│   ├── neighborhoods/
│   └── ...
│
├── (portal)/               ← internal + login + share — NO marketing chrome
│   ├── layout.tsx          ← minimal portal shell
│   ├── login/
│   │   └── page.tsx        ← magic link sign-in form
│   ├── internal/           ← ALL routes protected by middleware.ts
│   │   ├── layout.tsx      ← sidebar nav, user menu, autosave indicator
│   │   ├── page.tsx        ← DASHBOARD — list of all estimates
│   │   ├── estimates/
│   │   │   └── [id]/
│   │   │       ├── page.tsx        ← REVIEW PAGE — main editing surface
│   │   │       ├── preview/
│   │   │       │   └── page.tsx    ← CLIENT PREVIEW — what client sees
│   │   │       └── history/
│   │   │           └── page.tsx    ← VERSION HISTORY
│   │   └── bid-log/
│   │       └── page.tsx    ← WIN/LOSS TRACKER
│   └── share/
│       └── [token]/
│           └── page.tsx    ← PUBLIC CLIENT LINK — no auth, token-gated
│
└── api/                    ← stays at root level (not in route groups)
    ├── estimates/
    │   ├── ingest/
    │   │   └── route.ts    ← POST — pipeline pushes here
    │   ├── route.ts        ← GET (list)
    │   └── [id]/
    │       ├── route.ts                    ← GET / PATCH
    │       ├── version/route.ts            ← POST (snapshot version)
    │       ├── trades/
    │       │   ├── route.ts                ← GET / POST
    │       │   └── [tradeId]/route.ts      ← PATCH / DELETE
    │       ├── line-items/
    │       │   ├── route.ts                ← GET / POST
    │       │   └── [itemId]/route.ts       ← PATCH / DELETE
    │       ├── export/route.ts             ← POST (generate xlsx + docx)
    │       ├── send-email/route.ts         ← POST (send via Resend)
    │       └── bid-log/route.ts            ← GET / POST
    ├── bid-log/
    │   └── [logId]/route.ts                ← PATCH
    └── share/
        └── [token]/route.ts                ← GET (public, validates token)
```

---

## DATABASE SCHEMA (run in Supabase SQL Editor before writing any app code)

### Tables summary

| Table | Purpose |
|---|---|
| `jobs` | Project metadata: name, client, address, AHJ, bid due date, status |
| `estimates` | Versioned estimate: OH/profit/contingency config, totals cache, review status, output format |
| `estimate_trades` | One row per trade per estimate: SP/SUB/DEFERRED/NIS, labor rate override, subtotals |
| `estimate_line_items` | Full line item: qty, material_unit_cost, labor_unit_cost, labor_hours_per_unit, confidence, flags, ai_baseline_snapshot |
| `estimate_overrides` | Append-only audit log of every value Marco changed (for forensics/diff) |
| `bid_log` | Won/Lost/Pending status, submitted amount, loss reason, competitor price |
| `export_links` | Expiring share tokens: token, format, expires_at, view_count, storage paths |
| `email_log` | Delivery records: recipient, Resend message ID, status, sent_at |

### Critical schema design decisions
- `material_unit_cost` and `labor_unit_cost` are stored as **separate columns** — this is what makes per-trade labor rate overrides work correctly
- `total` column is a GENERATED ALWAYS AS column: `(quantity * material_unit_cost) + (quantity * labor_unit_cost)` — Postgres computes it, can never be wrong
- `ai_baseline_snapshot` JSONB column on line items is FROZEN at ingest time and NEVER updated — powers the diff view
- `is_deleted` boolean on line items = soft delete (Marco can undo deletions)
- `is_manual_override` boolean = Marco added or edited this row (vs AI-generated)
- All tables have `created_at` and `updated_at` with a trigger function `set_updated_at()`
- RLS enabled on all tables: authenticated role (Marco) = full access; anon role = only valid export_links (for public share page)

### Full SQL schema
See the schema design document — the full CREATE TABLE statements with all indexes, triggers, RLS policies, and the `export_links` public read policy are ready to run verbatim. Run in this order:
1. `set_updated_at()` trigger function
2. `jobs`
3. `estimates`
4. `estimate_trades`
5. `estimate_line_items`
6. `estimate_overrides`
7. `bid_log`
8. `export_links`
9. `email_log`
10. RLS policies block

---

## SUPABASE AUTH SETUP (manual steps, do before writing any code)

1. **Run SQL schema** in Supabase SQL Editor
2. **Create Marco's account manually**:
   - Authentication → Users → Add User → enter `marco@saddlewoodcontracting.com`
   - This sends a magic link to Marco's email — he clicks it to activate
3. **Disable new signups**:
   - Authentication → Providers → Email → uncheck "Allow new users to sign up"
   - This means no one else can ever create an account, even if they find the login page
4. **Get API keys**:
   - Supabase dashboard → Project Settings → API
   - Copy: `anon` public key → goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy: `service_role` secret key → goes in `SUPABASE_SERVICE_ROLE_KEY` (never expose this)
5. **Create storage bucket**:
   - Storage → New bucket → name: `estimate-exports` → Private → Create
   - Do NOT create a public bucket yet

---

## SUPABASE CLIENT FILES (three separate files — critical pattern)

```
src/lib/supabase/
├── client.ts        # Browser/Client Components — uses anon key, safe in browser bundle
├── server.ts        # Server Components + Route Handlers — reads from cookies, SSR-safe
└── admin.ts         # Service role — API routes ONLY, NEVER imported in client-side code
```

The `@supabase/ssr` package is the correct modern package. Do NOT use `@supabase/auth-helpers-nextjs` — it is deprecated.

---

## MIDDLEWARE (auth protection)

File: `src/middleware.ts` (create this before any portal routes exist)

Logic:
1. Intercepts all requests to `/internal/*`
2. Checks Supabase session cookie (via `@supabase/ssr` createServerClient)
3. Verifies `user.email === process.env.INTERNAL_ALLOWED_EMAIL`
4. If check fails: redirect to `/login?redirectTo=[original path]`
5. If check passes: allow request through

Also: NO session required for `/share/[token]` — that route handles its own token validation server-side.

---

## ENVIRONMENT VARIABLES (complete list)

### In `.env.local` (local development, never commit)

```bash
# Supabase — public, safe in browser bundle
NEXT_PUBLIC_SUPABASE_URL=https://rwzmcknxlucwbhsyxdcx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase dashboard → Settings → API>

# Supabase — SECRET, server-side only, bypasses RLS
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard → Settings → API>

# Auth whitelist — server-side only
INTERNAL_ALLOWED_EMAIL=marco@saddlewoodcontracting.com

# Pipeline ingest secret — server-side only
# Generate with: openssl rand -hex 32
PIPELINE_INGEST_SECRET=<generate a random 64-char hex string>

# Email delivery — server-side only
RESEND_API_KEY=<from resend.com after creating account>
RESEND_FROM_ADDRESS=info@saddlewoodcontracting.com

# App URL — used for building share links
NEXT_PUBLIC_APP_URL=https://saddlewoodcontracting.com
```

### In Vercel dashboard (Project → Settings → Environment Variables)
Set ALL the non-NEXT_PUBLIC_ vars here too with scope: Production + Preview.
The NEXT_PUBLIC_ vars go in Vercel too so the build can access them.

### Security rules
- `SUPABASE_SERVICE_ROLE_KEY` and `PIPELINE_INGEST_SECRET` and `RESEND_API_KEY` must NEVER appear in a committed file, the browser bundle, or any client-side import
- If any of these are accidentally exposed: rotate them immediately in Supabase/Resend dashboards

---

## NPM PACKAGES TO INSTALL (all at once before starting)

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install zustand
npm install resend
npm install exceljs
npm install docx
```

**Do NOT install**: `@clerk/nextjs`, `@supabase/auth-helpers-nextjs` (deprecated), `@react-pdf/renderer` (Phase 2 only)

---

## PIPELINE → PORTAL DATA HANDOFF (the "Pipeline JSON Step")

### What it is (plain English)
The AI pipeline currently runs on the estimator's Mac and drops files in a local folder. The portal lives on the internet. The Pipeline JSON Step is the bridge — at the end of every completed estimate, the pipeline automatically pushes all the data to the portal so Marco sees it in his browser without anyone emailing files.

### How it works technically
1. After Wave 4 completes and the Verification Protocol passes, the pipeline generates one JSON file: `output/estimate-payload.json`
2. The pipeline makes one HTTP call: `POST https://saddlewoodcontracting.com/api/estimates/ingest`
3. The call includes `Authorization: Bearer [PIPELINE_INGEST_SECRET]` in the header
4. The portal validates the secret, stores all the data in Supabase
5. Marco sees the new estimate in his dashboard

### What the JSON payload contains
```json
{
  "pipeline_version": "2.0",
  "job": {
    "name": "Bellevue Church",
    "client_name": "...",
    "address": "...",
    "ahj": "Surprise, AZ",
    "bid_due_date": "2026-06-15",
    "project_type": "Institutional"
  },
  "config": {
    "overhead_pct": 15,
    "profit_pct": 10,
    "contingency_pct": 5,
    "gc_sub_markup_pct": 10
  },
  "trades": [
    {
      "trade_name": "Framing",
      "trade_status": "SP",
      "line_items": [
        {
          "description": "3-5/8\" metal stud wall @ 16\" OC",
          "area_location": "Franklin_Hall",
          "quantity": 842,
          "unit": "LF",
          "material_unit_cost": 1.18,
          "labor_unit_cost": 2.40,
          "labor_hours_per_unit": 0.030,
          "dimension_type": "written",
          "source_sheet": "A3.1",
          "source_grid": "B/4",
          "confidence": "high",
          "flags": [],
          "is_allowance": false
        }
      ]
    }
  ]
}
```

### Modifications needed to the estimate skill
The `/estimate` skill needs one new step added at the end of Wave 4 (after the Verification Protocol reports APPROVE-READY):
1. Agent W4-A already writes `output/estimate-summary.md` — it also needs to write `output/estimate-payload.json` in the format above
2. After W4-C (sanity check) completes and verification passes, the orchestrator calls:
   ```bash
   curl -X POST https://saddlewoodcontracting.com/api/estimates/ingest \
     -H "Authorization: Bearer $PIPELINE_INGEST_SECRET" \
     -H "Content-Type: application/json" \
     -d @output/estimate-payload.json
   ```
3. On success (HTTP 201): report "Portal updated. Marco has been notified."
4. On failure: report the error but do NOT block Gate 3 — the estimate files still exist locally

### The ingest endpoint logic
`POST /api/estimates/ingest`:
1. Verify Bearer token matches `PIPELINE_INGEST_SECRET`
2. Compute SHA-256 of raw request body; check if already ingested (idempotency)
3. Using service-role Supabase client (bypasses RLS), in a transaction:
   - Upsert `jobs` row (match on job name + address, or create new)
   - Create `estimates` row with `is_ai_baseline = true`
   - Create `estimate_trades` rows
   - Create `estimate_line_items` rows with `ai_baseline_snapshot` = copy of all cost fields (frozen forever)
4. Return `{ estimateId, jobId }` with HTTP 201

---

## REVIEW PAGE — DETAILED SPEC

### Layout: two-panel

**Left panel (fixed ~320px width)**:
- Job info header: name, client, bid due date
- Financial controls:
  - Overhead % (number input, default from JOB_CONFIG)
  - Profit % (number input)
  - Contingency % (number input)
  - GC Sub Markup % (number input)
- Live totals summary (updates on every keystroke):
  ```
  Direct cost:      $XXX,XXX
  + Overhead (15%): $ XX,XXX
  + Contingency(5%):$ XX,XXX
  + Profit (10%):   $ XX,XXX
  ────────────────────────────
  GRAND TOTAL:      $XXX,XXX
  ```
- Flags summary panel:
  ```
  ⚠️  3 low-confidence items  ($12,400)
  ❓ 2 open RFIs              ($8,000 at risk)
  📋 2 sub allowances         ($45,000 placeholder)
  ```
  Click any line → jumps to those items in the trade sections
- Output format selector (5 cards with thumbnail + one-line description)
- Action buttons: [Preview for Client] [Generate Export] [Send Email]

**Right panel (scrollable)**:
- "Flags only" toggle at top — collapses everything except flagged/low-confidence/allowance items
- One accordion section per trade:
  - Collapsed: trade name, SP/SUB badge, item count, subtotal, confidence dot (green/yellow/red)
  - Expanded: table of line items
    - Columns: Description | Area | Qty | Unit | Mat $/unit | Labor $/unit | Total | Source | Conf
    - Every cell (except Source) is inline-editable
    - Edited cells: yellow background + hover tooltip showing original AI value
    - Soft-deleted rows: hidden by default, "Show N deleted items" toggle per trade
    - "Add row" button at bottom of each expanded trade
- Per-trade labor rate drawer:
  - Opens from a "⚙ Labor rates" button on each trade header
  - Shows AI's blended rate for this trade
  - Override input
  - Live impact preview: "Changing $X → $Y affects N items, net: +$Z"
  - "Reset to AI default" link

### Autosave behavior
- Every field edit → 2s debounce → PATCH to API
- Header indicator: "Saved · 2s ago" (green) / "Saving..." (spinner) / "Save failed — retry?" (red)
- NEVER lose an edit — all changes round-trip to server within 2s of last keystroke

### State management
- Zustand store initialized from Server Component's initial data fetch
- Store shape: `{ estimate, trades, lineItems: Record<id, LineItem>, dirtyItemIds: Set<string>, savingItemIds: Set<string>, lastSavedAt, saveError }`
- `lineItems` keyed by ID for O(1) updates (no array scanning)
- Optimistic: update store immediately on edit, PATCH fires async, reconcile on response

---

## THE 5 OUTPUT FORMAT OPTIONS

| Format ID | UI Label | What client sees |
|---|---|---|
| `detailed` | Itemized by Trade | Every line item grouped by trade section, with quantity, unit, unit price, line total |
| `trade_summary` | Trade Sections — Lump Sum | One section per trade: 3-6 bullet scope description + one total per trade |
| `summary` | Single Total | Grand total only with scope narrative paragraph. Use for competitive bids or owner-direct. |
| `unit_price_schedule` | CSI Division Schedule | Rolled up by CSI division code. Required by some commercial GC submittals. |
| `allowance_schedule` | Scope + Exclusion Narrative | Narrative scope, dollar totals only, explicit exclusion list. Used when unit prices should not be visible to client. |

Each format has a thumbnail preview image and a "When to use this" one-liner in the selector UI.

---

## EXPORT GENERATION

### Excel (`.xlsx`)
- Package: `exceljs` — works in Vercel serverless functions (no native deps)
- Tabs vary by format: Summary tab always present; detailed tab if `detailed` format
- Saddlewood branding: teal headers, gold accents, Fraunces font where possible
- Formulas live in the file (waste factors auto-recalculate if Marco adjusts quantities in Excel later)
- Stored in Supabase `estimate-exports` bucket at path: `{estimate_id}/{timestamp}-{format}.xlsx`

### Word (`.docx`)
- Package: `docx` — generates .docx programmatically
- Structure: Saddlewood header, scope sections by format, bid table, assumptions, exclusions, signature block
- Stored in same bucket: `{estimate_id}/{timestamp}-{format}.docx`

### PDF
- Phase 1: Browser print-to-PDF. The `/internal/estimates/[id]/preview` page renders the estimate in React with `@media print` CSS. Marco presses Cmd+P → Print → Save as PDF. No dependencies needed.
- Phase 2 (future): Server-side PDF via Puppeteer on a Cloudflare Worker or via a dedicated `/api/estimates/[id]/pdf` route

### Shareable client link
- After export: creates row in `export_links` table with a 32-byte random hex token
- Client URL: `https://saddlewoodcontracting.com/share/[token]`
- Expires: 30 days (matches `BID_VALID_DAYS` from JOB_CONFIG)
- The `/share/[token]` page validates token server-side, renders estimate in chosen format, requires no login
- View count tracked in `export_links` table (Marco can see "client opened this 3 times")

---

## EMAIL DELIVERY

**Service**: Resend (resend.com)
- Free tier: 3,000 emails/month — more than sufficient
- From address: info@saddlewoodcontracting.com (requires DNS verification for this domain in Resend — add SPF/DKIM records)
- Package: `resend` npm

**Email structure**:
- Subject: "Estimate from Saddlewood Contracting — [Job Name]"
- Body: Saddlewood logo, brief intro, grand total prominently displayed, [View Estimate] CTA button linking to `/share/[token]`
- Attachment: `.xlsx` file (or Supabase Storage signed URL if file > 5MB)
- All sends logged in `email_log` table with recipient, timestamp, Resend message ID

**Resend domain setup** (manual step before first send):
1. Create account at resend.com
2. Add domain: saddlewoodcontracting.com
3. Add DNS records Resend provides (SPF + DKIM)
4. Verify domain
5. Copy API key → `RESEND_API_KEY` env var

---

## BID LOG / WIN-LOSS TRACKING

**On the dashboard**, each estimate card has a status dropdown:
- Draft / In Review / Approved / Sent to Client / **Won** / **Lost** / No Decision / Cancelled

When Marco marks **Lost**, a modal asks:
- Loss reason: [Price too high / Timeline conflict / Went with existing sub / No decision made / Client cancelled project / Other]
- Competitor price (optional): $___
- Notes (optional)

**Dashboard metrics** (top of dashboard):
- "This quarter: X won / Y submitted — Z% win rate"
- "Average bid: $X | Average winning bid: $X"

Over time, the loss reason data shows patterns (e.g., "consistently losing on price in the electrical trade").

---

## PACKAGE INSTALLATION ORDER (execute before writing any code)

```bash
# Run in the repo root
npm install @supabase/supabase-js @supabase/ssr
npm install zustand
npm install resend
npm install exceljs
npm install docx
```

---

## PHASE-BY-PHASE EXECUTION PLAN

### Phase 1 — Foundation (everything else depends on this)
**Goal**: Marco can log in and see a placeholder dashboard. No estimate data yet.

Steps (in order):
1. **Route group refactor** — Move all existing pages into `src/app/(marketing)/`. Create `src/app/(marketing)/layout.tsx` with the existing Navbar/Footer/GHL widget. Remove those from root `layout.tsx`. Create `src/app/(portal)/layout.tsx` as a minimal shell (no marketing chrome).
2. **Supabase manual setup** — Run SQL schema, create Marco's user, disable signups, create storage bucket, get API keys
3. **Install packages** — `@supabase/supabase-js @supabase/ssr zustand resend exceljs docx`
4. **Create `.env.local`** with all env vars
5. **Create three Supabase client files** — `lib/supabase/client.ts`, `server.ts`, `admin.ts`
6. **Create `middleware.ts`** — session check on `/internal/*`, email whitelist, redirect to `/login`
7. **Create `/login` page** — one email input, "Send magic link" button, calls `supabase.auth.signInWithOtp()`, success state shows "Check your email"
8. **Create `/internal` placeholder page** — just a "You're logged in" page
9. **Test**: Marco logs in via magic link, reaches `/internal`, tries a non-Marco email and gets redirected to `/login`

**Done when**: Login works end-to-end for Marco's email only.

### Phase 2 — Data pipeline
**Goal**: A completed estimate can be pushed from the local pipeline into the portal.

Steps (in order):
1. **Generate `PIPELINE_INGEST_SECRET`**: `openssl rand -hex 32` → add to `.env.local` and Vercel
2. **Create `/api/estimates/ingest` route** — validates Bearer token, parses payload, inserts into Supabase using admin client, returns `{ estimateId, jobId }`
3. **Modify estimate skill** — add new final step to Wave 4: write `output/estimate-payload.json` and POST to ingest endpoint
4. **Add `ROLLUP_AND_PROPOSAL_PROMPT` output** — add JSON serialization step to the rollup prompt so it produces `estimate-payload.json` alongside the existing `.xlsx` and `.docx`
5. **Test**: run a sample estimate (can use Bellevue Church), confirm data appears in Supabase tables, confirm `api/estimates/ingest` returns 201

**Done when**: Running `/estimate full [path]` results in a new estimate visible in Supabase.

### Phase 3 — Dashboard + read-only review
**Goal**: Marco can see all estimates listed and read (but not yet edit) any estimate.

Steps (in order):
1. **`/internal` dashboard** — Server Component fetches estimates list from Supabase; renders estimate cards with: job name, client, bid due date, status badge, confidence dot, last edited timestamp, grand total
2. **`/internal/estimates/[id]`** — Server Component loads full estimate (JOIN across estimates + trades + line_items); renders read-only two-panel layout with trade accordions; Zustand store initialized with data
3. **Flags panel** — filter/count of low-confidence items, open RFIs, allowances
4. **Trade accordion UI** — collapsed/expanded states, line item table (read-only cells)
5. **Status badge** — shows current `review_status` from DB

**Done when**: Marco can browse all estimates and see all the data, just can't edit yet.

### Phase 4 — Editing
**Goal**: Marco can make all the edits described in the spec.

Steps (in order):
1. **OH/Profit/Contingency inputs** — wire to Zustand store, live total recalculation, PATCH `/api/estimates/[id]`
2. **Per-trade labor rate overrides** — drawer UI, PATCH `/api/estimates/[id]/trades/[tradeId]`
3. **Line item inline editing** — quantity, material $/unit, labor $/unit, description; PATCH `/api/estimates/[id]/line-items/[itemId]`; autosave hook
4. **AI baseline diff display** — yellow highlight on edited cells, hover tooltip showing original value
5. **Add row** — POST creates new line item with `is_manual_override = true`
6. **Soft delete row** — PATCH sets `is_deleted = true`; "Show deleted" toggle per trade
7. **GC Sub Markup %** — wire to Zustand store + PATCH

**Done when**: Marco can fully edit an estimate and all changes persist after page reload.

### Phase 5 — Export & delivery
**Goal**: Marco can generate client-facing files and send them.

Steps (in order):
1. **Format selector UI** — 5 cards with thumbnails and "when to use" descriptions
2. **`/internal/estimates/[id]/preview`** — Server Component renders estimate in chosen format with print CSS; "Print to PDF" instruction shown
3. **Excel export** — `/api/estimates/[id]/export` route uses `exceljs` to build `.xlsx`, stores in Supabase Storage `estimate-exports` bucket, creates `export_links` row
4. **DOCX export** — same route, uses `docx` package, stores in same bucket
5. **Share link generation** — returns `/share/[token]` URL; show in left panel with copy button
6. **`/share/[token]` public page** — Server Component validates token (checks expiry, revocation), renders estimate in chosen format, increments `view_count`
7. **Email send** — `send-email` modal in left panel: recipient email, optional personal message, sends via Resend with share link + attachment, logs in `email_log`

**Done when**: Marco can generate an Excel, send an email to a client, and the client can open the share link.

### Phase 6 — Bid log & polish
**Goal**: Win/loss tracking, dashboard metrics, edge case handling.

Steps (in order):
1. **Status dropdown** on estimate cards and review page header
2. **Loss modal** — loss reason + competitor price capture
3. **`/internal/bid-log`** — aggregate view: win rate, average bid, loss reason breakdown
4. **Dashboard metrics strip** — "This quarter: X won / Y submitted"
5. **Estimate archive** — filter by date range, searchable
6. **Bid validity expiry alert** — flag any approved estimate approaching 30-day expiry that hasn't been sent
7. **"Copy for Joist" panel** — formatted trade totals ready to paste into Joist manually

**Done when**: Full system is usable for production.

---

## WHAT NOT TO BUILD (agreed scope exclusions for now)

- **Joist API integration** — no API exists; manual copy is the workaround
- **Re-run single trade agent from portal** — complex two-way communication; Phase 2+ feature
- **Server-side PDF generation** — browser print-to-PDF is sufficient for Phase 1
- **Multi-user access** — Marco is the only user; RLS is set up to support adding users later but don't build team features now
- **Real-time collaborative editing** — not needed for one user
- **Mobile editing** — read-only tablet mode is acceptable; full editing stays desktop-only
- **Supabase Realtime subscriptions** — not needed for single user

---

## INTEGRATION: ESTIMATE SKILL MODIFICATIONS NEEDED

Two modifications to the existing estimate pipeline (do these in Phase 2):

### 1. ROLLUP_AND_PROPOSAL_PROMPT — add JSON output
The rollup prompt currently produces: `estimate-detailed.xlsx`, `estimate-summary.md`, `Proposal.md`, `Proposal.docx`
Add: `estimate-payload.json` in the exact schema above

### 2. Estimate skill — add portal push step
In the WAVE 4 section of `estimate.md`, after Agent W4-C (sanity check) completes and PIPELINE VERIFICATION PROTOCOL reports APPROVE-READY:

```
**Agent W4-D: Portal Push** (after verification passes)
- Read: `output/estimate-payload.json`
- Action: POST to `$PORTAL_URL/api/estimates/ingest` with `Authorization: Bearer $PIPELINE_INGEST_SECRET`
- On HTTP 201: report "✅ Portal updated — Marco can review at saddlewoodcontracting.com/internal"
- On failure: report error but DO NOT block Gate 3 — estimate files still exist locally
- Output: no file written (just the HTTP call)
```

Add two new env vars to the pipeline environment:
- `PORTAL_URL=https://saddlewoodcontracting.com`
- `PIPELINE_INGEST_SECRET=<same value as in Vercel dashboard>`

---

## PRE-EXECUTION CHECKLIST (complete before starting Phase 1)

- [ ] GitHub PAT has been revoked and regenerated (the one shared in chat is compromised)
- [ ] Vercel plan confirmed as Pro
- [ ] Repo cloned locally: `git clone https://github.com/yvzizkz/Saddlewood`
- [ ] Node version confirmed: `node --version` (should be 18+)
- [ ] Supabase SQL schema run successfully (all 8 tables visible in Table Editor)
- [ ] Marco's user created manually in Supabase Auth
- [ ] New signups disabled in Supabase Auth settings
- [ ] `estimate-exports` storage bucket created (private)
- [ ] Supabase API keys copied (anon + service_role)
- [ ] `PIPELINE_INGEST_SECRET` generated: `openssl rand -hex 32`
- [ ] Resend account created + domain verified + API key copied
- [ ] All env vars added to `.env.local` locally
- [ ] All env vars added to Vercel dashboard (Production + Preview)
- [ ] `npm install @supabase/supabase-js @supabase/ssr zustand resend exceljs docx` run successfully

---

## NOTES FOR FUTURE SESSIONS

- **Always start a new session** by reading this file + the estimate skill + CLAUDE_BASE.md
- **Do NOT re-ask decisions** that are captured in this document
- **Phase ordering is strict** — do not start Phase 3 before Phase 2 data is flowing; the UI is useless without real data
- **The route group refactor is the very first code change** — do it before touching any portal files
- **SQL schema must be run before any API routes are written** — the routes reference table names
- **Test the ingest endpoint with curl before building any UI** — a broken ingest kills the whole pipeline→portal connection


---

## AMENDMENTS — Gap Fixes (2026-05-13)

### Gap 2 Fix — ESTIMATOR_EMAIL Environment Variable

This variable was missing from the original plan. It is required for the `estimate-approved-internal` email template (and other internal notifications) to have a destination.

**Add to `.env.local`:**
```bash
# Estimator / operations inbox — receives notifications when Marco approves, requests changes, etc.
ESTIMATOR_EMAIL=info@saddlewoodcontracting.com
```

**Add to Vercel dashboard** (Project → Settings → Environment Variables, scope: Production + Preview):
- Key: `ESTIMATOR_EMAIL`
- Value: `info@saddlewoodcontracting.com`

**Where it is used:**
- `estimate-approved-internal` template (to: ESTIMATOR_EMAIL) — fires when Marco approves
- `estimate-changes-requested` template (to: ESTIMATOR_EMAIL) — fires when Marco requests changes
- `estimate-rejected` template (to: ESTIMATOR_EMAIL) — fires if Marco marks "not bidding"
- Any other internal operational notification that needs to reach the estimator

**Updated complete ENV vars list** — add this entry between `MARCO_EMAIL` and `NEXT_PUBLIC_APP_URL`:
```bash
MARCO_EMAIL=marco@saddlewoodcontracting.com
ESTIMATOR_EMAIL=info@saddlewoodcontracting.com   # ← ADD THIS
NEXT_PUBLIC_APP_URL=https://saddlewoodcontracting.com
```

### Gap 4 Fix — Re-Ingest Versioning

When the pipeline runs a second time for the same job (e.g., revised electrical allowance, re-run framing agent), the ingest endpoint will receive a different payload hash and create a new `estimates` row. The following rules govern versioning:

**Ingest endpoint versioning logic (add to `/api/estimates/ingest`):**
1. After upserting the `jobs` row, query: `SELECT MAX(version) FROM estimates WHERE job_id = $jobId`
2. If result is NULL (first estimate for this job): `version = 1`, `parent_estimate_id = null`, `is_ai_baseline = true`
3. If result >= 1 (revision): `version = MAX + 1`, `parent_estimate_id = id of the version with MAX version`, `is_ai_baseline = true`
4. Archive the previous estimate: `UPDATE estimates SET review_status = 'archived' WHERE job_id = $jobId AND version = MAX AND id != new_estimate_id`

**Pipeline ingest payload — add optional field:**
```typescript
interface IngestPayload {
  pipeline_version: string
  ingest_mode?: 'new' | 'revision'  // ← ADD: 'revision' signals this replaces a previous estimate
  job: { ... }
  // ... rest unchanged
}
```

**Dashboard display:** Group estimates by `job_id`. Show only the highest version by default. "Show previous versions" expander shows archived versions. Each version card shows "v2" badge if `version > 1`.

**Version history page** (`/internal/estimates/[id]/history`): Lists all estimates for the same `job_id`, sorted by version DESC, with a diff summary between versions (count of changed line items, net dollar change).
