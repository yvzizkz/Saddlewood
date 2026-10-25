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

## 6. Every department, one schedule, one task system

**Owner's scope (10/20):** schedule, field operations, worker functions, the PM's task delegation, and every department identified for automation. They must be cohesive, all in one app, connected through the job.

Source: KB `OPERATING-MODEL-2026-09-04` (OM) §2–§8, `ROLE-GAP-ANALYSIS`, `FIELD-SIGNALS-PLAN-2026-10-19` (FSP), and SOP-001 to SOP-009. OM and SOP-005 to SOP-009 are still drafts.

### 6.1 Structure change: organize by the work, not by the person

The OM splits the company by person: Marco, Lando, Ilene, Eli, an empty Estimating Admin seat and a proposed Bookkeeper. Putting that split into an app breaks in three places:

1. **Two seats are empty.** Estimating Admin and Bookkeeper have no person, and the Field Ops Lead isn't designed yet.
2. **The SOP owner headers disagree with OM §2.** SOP-001, SOP-002 and SOP-004 still say Marco; OM says Lando or Ilene.
3. **Purchase limits are written three ways:**
   - OM: PM under $500, Lando $500–5k, Marco over $5k;
   - FSP and the app: $500/$1,000, PM then owner;
   - SOP-008: work orders under $10k.

**Decision:** the app is organized by **work objects**: Jobs, Schedule, Tasks, Accounting, Sales, Crew, Subs and vendors, Compliance.
- A **department home** is a view of those objects through a role.
- Work is **assigned to a role** (PM, Finance, Sales admin, Owner, Field lead, Crew), and a role is held by a person.
- An empty seat is held by whoever covers it: Marco covers Sales admin, Ilene covers Bookkeeper. Hiring someone reassigns the seat, and every open task follows.
- **One decision-rights table** in Company policies (role × action × dollar limit) replaces the three versions of the limits. It drives approvals, task assignment and escalation. The SOP owner lines are read from it.

*Why:* a department named after a person is the same mistake as a page named after a prototype. The work outlives the seat.

### 6.2 Department homes

| Department (role) | Held by | Home | KPI header (period picker, drill-down) | Table |
|---|---|---|---|---|
| Owner | Marco | `/app` (Owner desk) | Decisions waiting, CO dollars awaiting price, AR 14+ days, margin by job | Decisions (`ASK:` items, approvals over limits) with `rule?`; weekly count of decisions without a rule (OM A6) |
| Ops and systems | Lando | `/app/ops` | Friction log ranked (score = per week × minutes × weight), board throughput, automation rungs (Rule → Draft → Auto → Measured) | Ops cards, friction items, SOP revisions |
| Finance and admin | Ilene (+ Bookkeeper seat) | `/app/accounting` (§3) + **Compliance** | AR, AP, payroll, materials, job cost; compliance: COIs expiring, waivers missing, W-9s | Every Accounting table; compliance register |
| Project management | Eli | `/app/jobs` + Schedule + Tasks | Jobs behind plan, hours used vs earned by phase, open punch, COs awaiting price, daily logs missing | My jobs, my team's tasks, look-ahead |
| Estimating and sales admin | empty (Marco) | `/app/sales` | Pipeline value by stage and source, win rate by source, estimates past follow-up (SOP-005: 5 business days) | Leads, estimates, revisions queue |
| Field and crew | crew, Field lead | `/app` crew Today | Their day: where, what, hours, tasks | Their tasks, their week |
| Subs and vendors | PM (awards under $10k), Marco | `/app/subs` | Packages by stage against SOP-008 service levels, sub scorecard, COI and W-9 status, spend by vendor | Directory, packages, bids, bills (links into AP) |

Every home uses the same blocks: period picker, KPI header, drill-down, a table you can filter, search, select and export, and breadcrumbs. Every row links through its job.

### 6.3 One schedule

Today a job's schedule is spread over eight places:
- Eli's night-before dispatch;
- `crew_schedule`;
- phase windows (`crew_job_phases`);
- the GC's Procore schedule;
- the Wednesday look-ahead;
- `job_watches`;
- `tasks.py` reminders (COI, billing);
- the Ops calendar (`ops_goals`).

**Decision:** one schedule feed (`src/lib/schedule/feed.ts`) reads every source in place and returns one list of events:

`{ id, kind, job, title, start, end, who (role or person), source link, status }`

Only events that have no home today get a new table, `schedule_items`: inspections, site visits, deliveries, meetings and sub mobilizations.

| Kind | Source |
|---|---|
| Crew assignment (who, where, when) | `crew_schedule` |
| Phase window / stage | `crew_job_phases` (planned_from/to, verified_at) |
| Sub mobilization, bid due | `bid_packages.due_at`, awards → `schedule_items` |
| Inspection, site visit, delivery, meeting | **new** `schedule_items` |
| Billing cutoff (AFT 23rd, homeowner 1st/15th, Schifferer per subcontract) + PM % complete due at cutoff −3 business days | computed from `clients.billing` + `jobs.billing` |
| AR ladder steps | `billing/ladder.ts` |
| Contract watches (agreement, deposit, 20-day notice, COI to GC, permit) | `job_watches` |
| COI and W-9 expiries, MSA renewals | `subs` (+ compliance register) |
| Pay days: payroll and sub pay cadence | `app_settings` + per-sub terms (AP) |
| Company dates and goals | `ops_goals` |

The views are cuts of that one feed:
- **My day** on the phone: where to be, what to do, what's due.
- **Week board** on the desktop: jobs × days with crews, subs, inspections and deliveries.
- **Month** calendar.
- **Two-week look-ahead** per GC: the Wednesday email, drafted for review, never sent automatically.
- **Job timeline:** the phases with everything dated on that job.

### 6.4 Field operations and worker functions

The crew's day stays on the phone. Each part writes straight to the job, payroll and job costing:

| Worker function | Writes | Flows to |
|---|---|---|
| Clock in/out (geo, far-punch chip at 805 m) | `crew_shifts` (+ `trade` from the phase being worked, 0029) | Payroll, job labor, job cost |
| Where to be, what to do | schedule feed + tasks | My day |
| Receipts | `crew_entries` receipt → **normalized into `purchases`** (source `app`, trade, job) | Purchases, AP (reimbursement when paid by the worker), job cost |
| Daily log (SOP-006 App C: weather, crew, work done, deliveries, visitors, directives, inspections, issues/RFI, safety, photos), due 6 PM | `crew_entries` eod + structured fields | Job log, PM "logs missing", Owner desk |
| Progress photos (3 end-of-day, SOP-009) | `crew_entries` progress + files | Job documents, billing % complete evidence |
| Pre-cover checklist (every wall, both faces, location label; chain pre-cover → pre-board → pre-tape → pre-texture → pre-paint) | **new** `checklists` per phase | Phase verify (`tasks.verify`), quality gate before the next phase |
| Punch | tasks of kind `punch` per job and location | Closeout gate, PM punch count |
| Needs and will-call | material request → pickup → runner (live) | Purchases, approvals by the decision-rights table |
| Directives and T&M | `ASK:`/directive items → **CO intake** (`CO-n awaiting price`, age alert) | Owner desk, Billing (CO register) |

### 6.5 One task system (PM delegation)

Today tasks live in seven places:
- `crew_tasks`;
- bot duties;
- `ops_cards`;
- the bot's waiting-on ledger;
- "Which job is this?" cards;
- material-request approvals;
- job watches.

**Decision:** one `work_items` table for every new kind, plus a read model (`src/lib/tasks/feed.ts`) that lists the existing kinds in place until each moves over.

**Fields:** kind, title, job, department, assignee (role and, optionally, person), due date, escalation rule, status, source link, created by.

**Kinds:**
- task, punch, follow-up;
- approval (from the decision-rights table);
- CO awaiting price;
- decision (`ASK:`);
- compliance (COI, waiver, W-9);
- billing step (% complete due, invoice package);
- daily-log missing;
- friction item.

**Escalation** follows the decision-rights table and the SOP service levels:
- SOP-004: a sub invoice unapproved after 10 days;
- SOP-005: no follow-up after 5 business days;
- SOP-008: package in 2 days, invites in 1, level in 2, award in 1;
- SOP-009: miss ladder;
- SOP-001: receipt exceptions.

An overdue item moves up one role and shows in that person's "Waiting on you".

**Views:**
- **Mine** (phone);
- **My team** (PM: assign, re-assign, due dates);
- **Per job** (job page tab);
- **Per department** (department home).

The 7 AM push reads the same feed.

### 6.6 Automation map: every "Build next" row has a disposition

OM §7 rows A1 to A13 and SOP-008 §4 rows S1 to S9. Each is built (with its phase), already live, or dropped.

| ID | Need | Disposition |
|---|---|---|
| A1 | Daily log + missing-log nag | **Build (P2):** structured daily log on the phone; "log missing" task at 6 PM (the app setting; OM's 5 pm is stale) |
| A2 | Directive/CO capture | **Build (P2):** CO register + intake → "CO-n awaiting price" with an age alert; invoice guard against lines with no CO (SOP-002, more than 2% growth) |
| A3 | Billing calendar + invoice package | **Build (P1 Billing calendar, P2 package):** cutoffs in the schedule; PM % complete task at cutoff −3 business days; package = % complete + photos + COs + waiver |
| A4 | Invoice receipt confirmation | **Live** (ladder step "not viewed after 2 business days"); show it in Receivables |
| A5 | AR ladder | **Live in `ladder.ts`.** One ladder config in Company policies. OM says "never auto-sent"; SOP-007 says the first three steps auto-send. **Owner question** below |
| A6 | Decision log | **Build (P2):** `ASK:` lines from the end-of-day memo → decision items to Marco with `rule?`; weekly count on the Owner desk |
| A7 | Job scorecard | **Build (P1 Job costing, P2 job page):** contract, billed, labor, materials, subs, margin; hours used vs earned by phase |
| A8 | Contract obligations → watches | **Live** (`job_watches`); extracting terms from a signed contract stays in the bot (dropped from the app) |
| A9 | Quality gates (pre-cover photos) | **Build (P2):** `checklists` per phase on the phone; gates phase verify |
| A10 | Handoff packet (Gate 0) | **Build (P2):** packet on the job page from Award (budget by phase, SOV, terms) + PM sign-off task |
| A11 | Sub bid-out | **Live** (0028: packages, invites, leveling, award). Quote parser **dropped** (bot); WO/MSA from variables → S7 |
| A12 | Sub pay cadence | **Build (P1 AP):** per-sub terms → bill due dates; flag unapproved after 10 days |
| A13 | Ops Board | **Live** (`/internal/ops`) → moves into the app (P2) |
| S1 | Directory fields + scorecard | **Live** + scorecard (P2: on-time against service levels, bid hit rate, punch count) |
| S2–S3 | Package generator, invite fan-out | **Live** (0028) |
| S4 | Quote parser | **Dropped** from the app (bot attachment extraction) |
| S5 | Leveling with gap plugging | **Live** (0028) |
| S6 | Award / thank-you emails | **Build (P2)** as drafts for review only; nothing sends without the owner |
| S7 | Work order / MSA from variables | **Build (P2):** work order document on the awarded bid (frozen like an invoice); no start without a signed WO and a COI |
| S8 | ROC lookup + COI watch | **Build (P2):** compliance register with COI expiry watches; ROC stays a manual field (no external calls) |
| S9 | Sub waiver per payment + scorecard | **Build (P1 AP):** a bill payment requires a conditional waiver; final waiver at closeout |

**Open owner questions (the app needs one answer each):**
1. **AR ladder sending.** Do the +1 and earlier steps send automatically from accounting@ (SOP-007, 10/05), or stay drafts (OM §7)? *Recommendation: SOP-007's three courtesy steps auto-send; +7 and later are drafts.*
2. **Decision-rights table seed.**
   - *Recommendation:* PM under $500; owners over $1,000 with both told; sub work orders under $10k by the PM inside budget. Lando's $500–5k band becomes a "Lando may approve" row.
   - *Why:* the app's live limits are what people are using now.
3. **Daily log time.** *Recommendation:* 6 PM (the app setting); OM text to be updated.

---

## 7. The program

### Phase 1: audit, design, Accounting (this PR)
1. Audit (§1) and this plan. ✅
2. Shared blocks (§5) with unit tests.
3. Unified navigation: the AppShell gets a desktop sidebar, the phone tabs change as in §2, and `/internal` uses the same nav component.
4. Accounting hub and Overview; Payroll; Purchases (agy); Payables with `bills`/`bill_payments` (agy); Receivables; Billing; Job costing (if time allows; otherwise first in Phase 2).
5. Migration `0029_trades.sql` (claude) and the AP migration (agy), applied to the local stack only.
6. A synthetic local seed (`supabase/seed-cohesive.sql`) that fills every section across Today/WTD/MTD/YTD.
7. Cross-review at 390 px and on desktop. One draft PR with phone and desktop screenshots.

### Phase 2 ✅ (2026-10-20, PR #32): every department, one schedule, one task system, the automation gaps (autopilot runs these in order, one PR per two or three steps)
1. ✅ **Job hub** `/app/jobs` + `/app/jobs/[id]`:
   - list on the shared blocks (period; by stage, PM or client);
   - job page tabs: Overview · Schedule · Tasks · Money · Labor · Purchases · Subs · Changes · Log · Documents · Crew, each reusing a section filtered to `job=<id>`;
   - `/app/projects` and `/app/crew?view=projects` redirect there.
   - Fix `JobPaperwork.tsx:70`.
   - Stage strip: Sale → Award → Handoff → Build → Billing → Closeout → Warranty.
2. **Decision-rights table** (§6.1). ✅ Built differently from the plan: there is no separate rights table. The limits already live in Company policies, and a second copy would drift. So `decisionRights()` reads them from there (`src/lib/roles/seats.ts`), and the new data is only `role_seats` (0032): who holds each role, plus the backup who covers it. The screen is `/app/policies/rights`.
   - Original plan, kept for reference:
   - `decision_rights` rows (role, action, limit) in Company policies;
   - roles and seats (who holds PM, Finance, Sales admin, Field lead), with cover for empty seats;
   - existing limits (`requests.pmLimitCents`, award limits) read from it.
3. ✅ **One task system** (§6.5): `work_items` (0033), `src/lib/tasks/feed.ts`, `/app/tasks`, and a Tasks tab on each job page. PM seats now open their own jobs and Tasks (`src/lib/jobs/access.ts`): they hand work to the PM or field lead, close it, record a change, and run the log and punch; money stays read only, and labor dollars, margin and sub bills follow policy. The 7 AM push reads the feed (`src/lib/owner/morning.ts`): each person gets their Mine part of it, led by what is overdue, due today and moved up to them, and finance gets a push of their own. Still to do: Home reading the feed, and PM writes on the Schedule.
   - `work_items` migration + `src/lib/tasks/feed.ts` over `crew_tasks`, ops cards, bot waiting-on, watches, purchase cards and request approvals;
   - views Mine / My team / Per job / Per department;
   - escalation by service level;
   - the 7 AM push and Home read it.
4. **One schedule** (§6.3):
   - `schedule_items` migration + `src/lib/schedule/feed.ts` over every source in the table;
   - My day (phone), Week board and Month (desktop), Job timeline, GC look-ahead draft.
5. **Field operations** (§6.4):
   - structured daily log + "log missing" item;
   - receipts normalized into `purchases`;
   - pre-cover `checklists` per phase gating verify;
   - punch items;
   - directives → CO intake.
6. ✅ (except SOV % billing) **Billing completion:** done as 0040 (`change_orders`, `lien_waivers`), `src/lib/billing/registers.ts`, the registers on Billing and the job's Changes tab, and CO, package and waiver items in the task feed. Still open: ladder config (owner question 1). SOV % billing has shipped as 0041 (`sov_progress`), with `src/lib/billing/progress*.ts` and the Job › Money progress card.
   - CO register (A2), waiver register, invoice package at cutoff (A3), ladder config (A5);
   - SOV percent-complete billing replacing the Powell tracker path (keep the tracker until it's replaced).
7. ✅ **Subs and compliance** (agy, `a7c0957`): sub scorecard and compliance register on Subs, a frozen work order with a mobilization gate, award and thank-you emails as drafts (never sent automatically), and a Gate 0 handoff card on the job page.
   - work order document (S7), compliance register with COI and W-9 watches (S8), sub scorecard (S1);
   - award emails as drafts (S6).
8. ✅ **Department homes** (§6.2): `/app/departments` and `/app/departments/[role]` (`src/lib/departments/home.ts`). The Ops board itself still lives at `/internal/ops`; the Ops home links to it.
   - Owner desk (decisions with `rule?`, A6);
   - Ops in the app (A13, friction log ranking);
   - Sales KPIs by source;
   - PM home;
   - Finance home = Accounting + Compliance.
9. ✅ **Links and duplicates:** done. `/app/money` now redirects to Receivables, its purchase search moved to Purchases (`#find`), and the bot's lanes read `role_seats`.
   - Home PaymentsCard, JobMoneyCard and PurchaseSearch link their invoice and job;
   - `/app/money/[id]` links its job and sale;
   - tracker pages link the job;
   - `/internal?tab=` estimates fold into Sales;
   - `/internal/activity` and `/internal/bid-log` placeholders go;
   - Money's purchase search becomes Accounting › Purchases.
   - Never the four batch-2 prototypes (they wait for their bot scripts).
10. ✅ **PM access:** `src/lib/accounting/access.ts`. A `money.view` seat sees Receivables, Billing, Purchases and Payroll hours on its own jobs. Pay and cost show only if `policy.pm.laborCost` / `policy.pm.margin` are on, never Payables, and invoices are read-only. Still to do: a field-lead seat. Accounting sections for `money.view` seats scoped to their jobs, no cost or pay. Field lead seat.
11. Each step: tests, lint, build, screenshots at 390 px and on desktop.

### Phase 3 (in progress; `docs/SCENARIOS.md`, `npm run e2e`): scenario testing, every department's real week (one PR)
1. Write `docs/SCENARIOS.md` from `docs/KB-OPERATIONS-MODEL.md` and OM §4. One scenario per department week, at least:
   - **Finance:**
     - an AFT billing week: Friday hours, the 23rd cutoff, PM % complete at −3 days, a change order, a conditional waiver, Melio paying the gross less 1%;
     - Powell progress payments on the SOV;
     - Tuesday AR call through the ladder;
     - payroll week export;
     - sub pay run with waivers.
   - **PM:** Gate 0 handoff → Gate 1 pre-con checklist → a week of dispatch, look-ahead Wednesday, Friday schedule and hours-vs-earned review, a punch walk.
   - **Field and crew:** a crew week with hours by trade across two jobs, a far punch, a time fix, receipts, the 6 PM daily log with photos, a pre-cover checklist that blocks a phase, a will-call pickup.
   - **Purchasing:** a Home Depot run split across jobs, an unmatched register name, a price-watch flag, a $500+ request through the decision-rights table.
   - **Subs:** package → invites → leveling → award under $10k by the PM → work order → no-COI block → bill → payment with waiver.
   - **Sales admin:** lead with source → estimate → no follow-up after 5 days escalates → proposal → award builds the job.
   - **Owner:** Monday decisions with `rule?`, CO pricing, AR day-14 call, Friday ops review.
2. Seed each scenario on the local stack (`supabase/seed-scenarios/*.sql`, synthetic names).
3. Drive them with Playwright (`e2e/*.spec.ts`) against `npm run dev` on the local stack. Assert the numbers on every screen they touch: department headlines, job page, schedule, tasks, exports.
4. Fix what breaks. Report a can/can't table per role: owner, PM, finance, sales admin, field lead, crew.

**Done means:** every department in §6.2 has its home in the app, connected through the job; the schedule and the tasks are one feed each; every row of §6.6 is built, live or consciously dropped; and every Phase 3 scenario passes.

---

## 8. Hard rules (bind every phase)

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
