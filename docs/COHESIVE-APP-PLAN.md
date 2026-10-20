# One Saddlewood app: the cohesive plan

**Written:** 2026-10-20, branch `feat/cohesive-app`.
**Owner's ask:** the app feels confusing and should be cohesive, with everything interconnected. Accounting gets its own sections (Purchases, Payroll, Payables, Receivables, Billing, plus anything else the data needs). Each section has a polished summary at the top (Today / WTD / MTD / YTD / custom, broken down by trade, job, person and vendor, and tap a slice to dig in) over a list you can filter, search, select and export. Then tie the rest of the app together, then test it against real-life scenarios from the KB.
**Mandate:** past specs, plans and rulings are evidence, not constraints. Anything that makes the app confusing gets replaced, logged in the vault decision log with a one-line why. The hard rules at the end still bind.

Inputs: the screens audit and data-model audit below (10/20, read-only, origin/main 70da9e4); the KB's `SADDLEWOOD-APP-SPEC-2026-10-05`, `APP-PERMISSIONS-PLAN-2026-10-12`, `APP-CLEANUP-2026-10-19` and `JOB-LIFECYCLE-PLAN-2026-10-19`; this repo's `docs/`; and `docs/KB-OPERATIONS-MODEL.md` (agy's model of how the company actually runs).

---

## 1. Audit: why it feels confusing

**Two apps behind one door.**
- `/app` is a centered phone column. The AppShell tabs are Home, Sales, Ask, Crew, Money, Duties and More, built from `components/bot/ui.tsx`.
- `/internal` is a desktop sidebar with 11 entries and its own markup, much of it stock Tailwind colors and emoji toasts.
- They share no layout. The only bridges are an owner-only list in More and one "Bot app" link on the desktop sidebar. The phone bottom bar in `/internal` has no way back to `/app`.

**The same thing in two places** (screen audit):

| Concept | Path 1 | Path 2 |
|---|---|---|
| Estimates | `/internal/estimates/[id]` (pipeline `estimates`) | `/app/sales/estimate/[eid]` (`sales_estimates`) |
| Proposals | `/internal/proposals` (Mac file; seed data on Vercel) | Sales proposals (`documents`, `/d/`) |
| Contracts and signing | `/internal/contracts` (`/sign/`) | Award + agreement watch |
| Leads | `/internal/leads` | Sales inbox |
| Invoices and AR | `/internal/trackers` | `/app/money` + `/app/bill` |
| Purchases | `/internal/expenses` › Purchases (mock JSON) | Money › Find a purchase; Crew › "Which job is this?" |
| Labor | `/internal/expenses` › Buildertrend Labor (mock JSON) | Crew › Hours (`crew_shifts`, pay rates, CSV) |
| Projects | `/app/projects` (no inbound link) | `/app/crew?view=projects` (same component) |
| Bids | `/internal/bid-log` (placeholder) | `/app/subs` |
| Activity | `/internal/activity` (placeholder) | Home feed |

**Dead ends.**
- `JobPaperwork.tsx:70` links to `/app/crew?view=jobs`, a view that does not exist.
- Home's PaymentsCard, JobMoneyCard and PurchaseSearch results name invoices and jobs without linking to them.
- `/app/money/[id]` has no link back to its job or sale.
- Trackers link to raw API JSON.

**Money is scattered and partly fake.**
- **Labor:** hours and labor cost live only in Crew › Hours.
- **Purchases:** a search box at the top of Money.
- **Expenses and labor in `/internal/expenses`:** made-up seed figures kept in a `progress_trackers` row.
- **Bills to pay (AP):** none, anywhere.
- **Change orders:** a document kind with no register.
- **Waivers:** files attached to documents, with no register.

**The data model, in short** (data audit):

| Area | Where it lives | What's wrong |
|---|---|---|
| Labor | `crew_shifts` (email, job_id text, day, start/end, break; `status='ok'`) | Trade lives only on the person (free text). Pay is one current `crew_people.pay_rate` (dollars per hour) with no history. `crew_shifts.job_id` has no foreign key. |
| Purchases | `purchases`, one row per receipt line in cents | `trade` comes from `trade_map` but is boxed into 8 values. Field receipts sit in `crew_entries` (dollars, no trade) and never reach `purchases`. |
| AR | `documents` (cents; estimate, change_order, invoice, statement, notice; frozen once issued), `payments` + `payment_allocations` (balance = total − allocations), `clients.billing` (net days, cutoff day, retainage, pay-when-paid) | |
| Old AR | `progress_trackers` (Powell, dollars) | |
| AP | nothing | No vendor bills, no sub bills, no payments out. `bid_responses.total_cents` on an awarded bid is the only committed cost. |
| Jobs | `jobs` (uuid; billing side) ↔ `crew_jobs` (text; field side) via `jobs.crew_job_id` | Labor and purchases key on `crew_jobs`; AR keys on `jobs`. |

**Do not touch (cleanup batch 2 is on hold):** `/internal/leads`, `/internal/proposals`, `/internal/contracts` and `/internal/expenses`, plus their APIs. Each is still wired into the Mac bot (`app_bridge.py`, `proposal.py`, `contract.py`, `crew.py`/`accounting.py`/`receipt_ocr.py`) or into client links already sent. The new navigation stops pointing people at them. It doesn't remove them.

---

## 2. Information architecture: one app, two layouts

**Decision:** there is one app at `/app`. A desktop is the same app with a sidebar and wide pages, not a different portal. `/internal` pages get the same navigation while they wait to move (Phase 2), so a person never switches apps. *Why:* the split is the main source of confusion. Every concept lives in two places, and the way between them is hidden.

### The sections

The phone tab bar shows the first five. The desktop sidebar shows all of them, grouped.

| Section | Route | What's in it | Who |
|---|---|---|---|
| **Home** | `/app` | Waiting on you, today, bot health | everyone (crew get their own Today) |
| **Jobs** | `/app/jobs` (Phase 2; `/app/projects` until then) | Every job; the job page is the hub (§4) | owners; PMs see their own jobs |
| **Crew** | `/app/crew` | Who is on the clock, schedule, runner, plan, team | owners, supervisors |
| **Accounting** | `/app/accounting` | The hub in §3 | owners |
| **More** | `/app/more` | Everything below | |
| Sales | `/app/sales` | Leads, estimates, proposals, award | sales seats |
| Subs and bids | `/app/subs` | Directory, bid packages, leveling, award | subs seats |
| Ask | `/app/ask` (and the header button) | The bot | staff |
| Duties | `/app/duties` | The bot's recurring duties | staff |
| Ops | `/internal/ops` → `/app/ops` in Phase 2 | Board, SOPs, calendar | staff |
| Settings | `/app/policies` + field and sales settings | One place for all settings (Phase 2) | owners |
| Old tools | `/internal/*` prototypes | Frozen: leads, proposals, contracts, expenses, estimates and trackers until replaced | owners |

- **Phone:** tabs are Home · Sales · Jobs · Crew · Accounting · More. Ask moves to a header button: it's a tool, not a place. Duties moves into More.
- **Desktop:** a left sidebar groups the sections as Work (Home, Jobs, Sales, Crew, Subs), Money (Accounting and its sections) and Office (Ask, Duties, Ops, Settings, Old tools). Pages built for the phone keep their column. Data pages (Accounting, Jobs) use the full width.
- **Crew seats** keep the CrewShell. It's the same app with fewer sections, and the server enforces every gate.
- **Every record has one address and links to its neighbors** (§4). The breadcrumb always says where you are: `Accounting › Payroll › Framing › 8009 Powell › Eli R., Oct 14`.

---

## 3. The Accounting hub

`/app/accounting`. On a phone it's one card per section. On a desktop the sections are a second row of navigation. Every section has the same anatomy:

1. **Period picker** (Today / Week / Month / Year / Custom, kept in the URL; the week runs Monday to Sunday, in Phoenix time).
2. **KPI header:**
   - the headline number with its change vs the previous period;
   - a trend chart (day, week or month buckets, picked from the period length);
   - a breakdown chart by trade, job, person or vendor, with a "By" switcher.
   Tapping a slice narrows everything on the page to it and switches the breakdown to the next grouping. The breadcrumb grows. Back undoes it.
3. **Table:** search, a filter per column, sort, multi-select, CSV/XLSX export of the selection or everything, and a card list on phones. Each row opens its record. The record links to its job, person, vendor, invoice or bill.

| Section | Route | Headline | Grouped by | Rows | Data |
|---|---|---|---|---|---|
| **Overview** | `/accounting` | Open AR, AP due this week, labor this week, materials this week | | Section cards | all below |
| **Payroll and labor** | `/payroll` | Labor hours (and labor cost, owners) | trade, job, person, day | Time entries (shift → person, job) | `crew_shifts` × `crew_people` |
| **Purchases** | `/purchases` | Material spend | job, trade, vendor, store | Receipt lines and trips → receipt, job | `purchases` (+ field receipts) |
| **Payables** | `/payables` | Owed to vendors and subs, aging, due Friday | vendor/sub, job, trade | Bills → vendor, job, awarded bid, payments | **new** `bills`, `bill_payments` |
| **Receivables** | `/receivables` | Open AR, aging 0–30/31–60/61–90/90+ | client, job, age | Open invoices → payments, proof record | `documents`, `payments`, `payment_allocations` |
| **Billing** | `/billing` | Billed this period, what's next to bill | client, job, kind | Invoices, change orders, statements; billing calendar from each client's cutoff (AFT 23rd, Schifferer 20th, homeowner 1st/15th) | `documents`, `clients.billing`, `jobs.billing` |
| **Job costing** (missing today) | `/job-costing` | Contract, billed, cost to date, margin (owners) | job, trade | Job → labor + materials + subs vs contract and budget | all of the above |

**Categorization added (owner's "every item to a trade"):**
- One trade list shared by purchases, time entries, phases, bid packages and subs: migration `0029_trades.sql`.
  - The table is keyed by slug.
  - `purchases.trade` is checked against it instead of 8 fixed values.
  - `crew_shifts.trade` is new. It's set from the phase being worked or the person's trade, and can be edited.
- Payroll groups by the shift's trade, falling back to the person's.
- Purchases groups by the line's trade, with "Unassigned" shown loudly so it gets fixed.

**Access:**
- Phase 1: owners only.
- Phase 2: PMs with `money.view` see Receivables, Billing and Purchases for their assigned jobs, and hours without dollars. That keeps the 10/13 rule: no cost, margin or pay rates for PMs.

---

## 4. How everything links (the entity map)

The job is the hub. The billing side `jobs` (uuid) and the field side `crew_jobs` (text) resolve to one job address with `jobRef()`, which looks up either id. Everything links in both directions:

```
                         client ── contacts
                           │
 sale (opportunity) ──► JOB ◄── award (contract value, SOV, watches)
                      ╱  │  ╲
       labor (shifts)    │    purchases (lines, trips) ── vendor
        └ person, trade  │     └ trade, receipt
                         │
 bid package ── awarded bid ── sub ── bills (AP) ── bill payments
                         │
 change orders ── invoices/statements ── payments ── allocations
                         │        └ waivers, exhibits, proof record (sent/viewed)
                    documents, phases, schedule, photos
```

| From | Links to |
|---|---|
| Job page | contract and COs, billed, paid, open AR, labor hours and cost, materials, sub commitments and bills, margin; crew, phases, documents |
| Time entry | person, job, trade, day; the payroll week |
| Purchase line or trip | job, trade, vendor and store, receipt; "Which job is this?" when unmatched |
| Bill (AP) | vendor or sub, job, trade, the awarded bid it bills against, its payments and waiver |
| Invoice (AR) | client, job, its payments, change orders on it, waiver and exhibits, the proof record |
| Payment in | client, the invoices it pays |
| Person | their hours, jobs, trade |
| Vendor/sub | their bills, purchases, bids, documents on file (COI, W-9) |

---

## 5. Shared building blocks (Phase 1, built)

| Block | File | Notes |
|---|---|---|
| Periods | `src/lib/analytics/period.ts` | `resolvePeriod({p, from, to})` → range, grain, previous range; buckets |
| Grouping | `src/lib/analytics/aggregate.ts` | `groupSum` (folds past 7 into Other), `trend`, `delta`, `compact`, `niceTicks` |
| Drill-down | `src/lib/analytics/drill.ts` | `drill(spec, rows, period, searchParams)` → totals, trend, breakdown with hrefs, crumbs, filters. Server-side, so the URL is the state |
| Export | `src/lib/analytics/exporting.ts` | CSV (formula-safe, UTF-8 BOM) and XLSX through `exceljs`, loaded only on click |
| Palette | `src/lib/analytics/palette.ts` | 8 brand hues; trades pinned to a slot |
| UI | `src/components/data/*` | `PeriodPicker`, `KpiHeader`, `TrendChart`, `BreakdownBars`, `DataTable`, `Breadcrumbs`, `SectionNav` |

**Charts are hand-built SVG** (no library):
- The view needs only three forms: a trend, ranked bars and a sparkline.
- Recharts is about 100 kB gzipped with d3 on top. Hand-built forms cost a few kB, render on the server, and follow the brand exactly.
- **The palette** was checked with the dataviz validator on white: worst adjacent CVD ΔE 9.2, normal-vision ΔE 20.1, all ≥ 3:1.
- **Marks:** bars at most 24 px thick with 4 px rounded ends and a 2 px gap; 2 px lines; hover and focus tooltips; every value also in the table.

---

## 6. The program

### Phase 1: audit, design, Accounting (this PR)
1. Audit (§1) and this plan. ✅
2. Shared blocks (§5) with unit tests.
3. Unified navigation: the AppShell gets a desktop sidebar, the phone tabs change as in §2, and `/internal` uses the same nav component.
4. Accounting hub and Overview; Payroll; Purchases (agy); Payables with `bills`/`bill_payments` (agy); Receivables; Billing; Job costing (if time allows; otherwise first in Phase 2).
5. Migration `0029_trades.sql` (claude) and the AP migration (agy), applied to the local stack only.
6. A synthetic local seed (`supabase/seed-cohesive.sql`) that fills every section across Today/WTD/MTD/YTD.
7. Cross-review at 390 px and on desktop. One draft PR with phone and desktop screenshots.

### Phase 2: everything else on the same structure (autopilot runs these in order; one PR)
1. **Job hub** `/app/jobs` + `/app/jobs/[id]`:
   - list on the shared blocks (period, by stage/PM/client);
   - job page with tabs Overview · Money · Labor · Purchases · Subs · Changes · Documents · Crew, each reusing the Accounting section filtered to `job=<id>`;
   - `/app/projects` and `/app/crew?view=projects` redirect there.
   - Fix `JobPaperwork.tsx:70`.
2. **Lifecycle on the job:** a stage strip (Sale → Award → Handoff → Build → Billing → Closeout → Warranty) from `JOB-LIFECYCLE-PLAN`, each stage linking to its records. Award lands on the new job page.
3. **Links everywhere:**
   - Home PaymentsCard, JobMoneyCard and PurchaseSearch results link their invoice and job;
   - `/app/money/[id]` links its job and sale;
   - tracker pages link the job, not raw JSON.
4. **Change orders and waivers registers** under Billing (CO number, amount, signed, billed on; waiver per invoice and amount, conditional or final, received).
5. **Ops** moves under `/app/ops` with the same navigation. Settings gathers into one place (Company policies, Sales settings, Field settings).
6. **Remove duplicate paths that aren't on hold:**
   - `/internal?tab=` estimates fold into Sales › Pipeline estimates;
   - `/internal/activity` and `/internal/bid-log` placeholders go;
   - Money's purchase search becomes Accounting › Purchases.
   - Never the four batch-2 prototypes: they wait for their bot scripts to move (KB `APP-CLEANUP` batch 2).
7. **PM access:** Accounting sections for `money.view` seats scoped to their jobs, no cost or pay.
8. Each step: tests, lint, build, and screenshots at 390 px and on desktop.

### Phase 3: scenario testing (one PR)
1. Write `docs/SCENARIOS.md` from `docs/KB-OPERATIONS-MODEL.md`. At least:
   - (a) an AFT billing week: work through Friday, the 23rd cutoff, a change order, a conditional waiver, Melio paying the gross less 1%;
   - (b) Powell progress payments on the SOV;
   - (c) a crew week with hours by trade across two jobs, a time fix and the payroll export;
   - (d) a Home Depot run split across jobs, plus an unmatched register name;
   - (e) a sub bid → award → sub bill → payment → waiver.
2. Seed each scenario on the local stack: `supabase/seed-scenarios/*.sql`, synthetic names.
3. Drive them with Playwright (`e2e/*.spec.ts`) against `npm run dev` on the local stack. Assert the numbers on every screen they touch: section headlines, job page, export rows.
4. Fix what breaks. Report a can/can't table for owner, PM and accountant.

---

## 7. Hard rules (bind every phase)

- **Local data only:**
  - Run against `supabase start` in this worktree, with `.env.local` pointing at it.
  - Never read, copy or source the main checkout's `.env.development.local` (prod keys).
  - Seeds are synthetic: fake names, emails and phones.
  - Resend, GHL and SMS keys stay unset, so sends fail closed.
- **Vercel previews may read production:** view them only, never submit a form.
- **Migrations:** new files in `supabase/migrations`, applied locally only and listed in the PR. Production is applied by the supervisor after review.
- **Don't touch:**
  - the bot, launchd, the KB repo's code, or other worktrees (`saddlewood-site-sales` is another session's);
  - the four batch-2 prototypes.
- **Contact nobody.**
- **Shipping:**
  - Branch `feat/cohesive-app`, small commits; `npm test`, `npm run lint` and `npm run build` green before every push.
  - One draft PR per phase with phone and desktop screenshots and what was verified.
  - Never merge: the supervisor reviews and merges.
