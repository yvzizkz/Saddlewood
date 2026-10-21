# Saddlewood Operations & Accounting Model (from Knowledge Base)

**Source:** Read-only synthesis of `~/dev/Saddlewood-KB` (`docs/DATA-NOTES.md`, `docs/SADDLEWOOD-APP-SPEC-2026-10-05.md`, `docs/AR-JOIST-RECONCILIATION-2026-07-25.md`, `docs/BILLING-ISSUE-PLAN-2026-10-12.md`, `docs/PM-MONEY-JOB-MAP-2026-10-13.md`, `docs/JOIST-MAP.md`, `docs/OPERATING-MODEL-2026-09-04.md`, `sops/SOP-001` through `SOP-009`, and `saddlewood-kb` MCP corpus queries).

---

## 1. Critical Data-Quality Traps (`DATA-NOTES.md` First)

Before trusting or modeling any historical number, the KB establishes six non-negotiable data rules:

1. **Joist Cumulative Restatements vs. Change Orders:**
   - Historically, Joist "MASTER INVOICE TOTAL SCOPE" documents restated the entire running job-to-date balance rather than billing incremental draws (e.g., Job `6602 N 40th St` ran `$898,613 -> $978,613 -> $1,195,613 -> $1,371,968 -> $1,406,968`).
   - Naive `SUM` over Joist invoices produced **$46.3M** across 2023–2026 ($15.66M open AR in Joist, including a single-day 2024-04-11 import batch of 7 unvoided master invoices totaling **$5.91M**).
   - However, those increases were **real scope additions (change orders)** ($645K on 6602 alone) filed by editing the master invoice instead of issuing separate `CO-<n>` documents.
   - **App Rule (SOP-002 & Spec §3.4):** Issued documents are frozen in `public.documents`. Change orders ≥ $1,000 are separate `change_order` documents (`CO-1`, `CO-2`...) that bill on their own invoice; minor extras < $1,000 go on the job's running minor-extras log. Master invoices are never restated.
2. **Joist Duplicate Numbers & Duplicate Payments:**
   - Joist allowed invoice number `8009-10` to be used twice on the Jury job (`2026-08-23` for `$10,200` Workout Room/Theatre, and `2026-09-23` for `$25,000` draw).
   - Duplicate payments occurred when a payment was recorded on both a master invoice and a draw (`3526--MAY MASTER INVOICE` and `3526--02`, both `$110,000` on `2026-05-26`).
   - **App Rule:** `documents_number_uidx` enforces unique `(kind, job_id, number, revision)` and `payment_allocations` binds every payment dollar to specific document/line items with a database trigger preventing over-allocation.
3. **Cash Arrives in Three Streams (Joist Only Saw Stream 1):**
   - **Stream 1:** Payments recorded inside Joist.
   - **Stream 2:** Direct GC ACH/Melio remittances announced by email (`remittance_in`) that never reached Joist—most notably **A Finer Touch Construction (AFT)** paying via **Melio** (e.g. `$75,000` on `8009-2`, `$31,196.40` on `5203-11`, `$96,600` across three Melio releases in Sept 2026, `$22,257.19` on `8009-08` on `2026-10-06`). Because Melio never synced to Joist, every AFT invoice looked unpaid in Joist.
   - **Stream 3:** Checks, wires, and Zelle transfers arriving with no email trail or needing project allocation (e.g., 5 Zelle payments totaling `$13,580` in the `2026-09-29` accounting check-in).
4. **Home Depot Pro Xtra vs. Register Receipts vs. Buildertrend Cost Inbox:**
   - **HD Pro Xtra export** (18,003 lines, `2024-05-22` to `2026-06-24`, **$647,913** true net spend across 24 months): `"Net Unit Price"` in HD's CSV is actually the **net line total (`Extended`)**; multiplying by `qty` inflated spend to $11.5M. Deduplication key is `(date, store, txn, register, sku, extended)`.
   - **1,199 OneDrive receipt PDFs** ($313,774, 6,602 lines): **98.3% (1,179)** carried a job name typed at the register (`job_name_raw`), whereas Buildertrend's Cost Inbox (3,004 rows, $168,347 in 2026 YTD) had a job assigned on only **2 of 3,004 rows**.
   - **Double-Counting Trap (Batch 3 cleanup):** The same Home Depot trip can enter via both the Pro Xtra feed (`source = 'hd'`) and a crew photo receipt (`source = 'app'`). Trips are keyed by `hd:<yyyymmdd>:<store>:<register>:<transaction>`.
   - **Register Alias Trap:** Cashiers type nicknames (`"tacho"` = Anastacio Mujica, 93 receipts; `"peter rabbit"` = `5203 N Monte Vista`, 11 receipts; `"PT LOMA"` = 41 trips / `$13,466`; `"marco"`, `"40 st"`, `"SHOP"`). Deterministic alias resolution (`job_aliases`) maps `normalizeJobName(job_name_raw)` to `crew_jobs.id`.
5. **Buildertrend Labor Snapshots & Duplicate Jobsites:**
   - Buildertrend `hours-by-employee` and `hours-by-job` CSV exports have no date column (cumulative snapshots only).
   - Job `12729 W Keim Dr` existed twice in Buildertrend (`"Keim dr"` vs `"Keim Dr"`), splitting **1,735.1 hours** across two records.
   - Employee names had doubled internal spaces (`"Anastacio  Mujica"`, `"Arnold  Mujica"`).
6. **Weekly Payroll Emails (`Payroll M/D/YY` from Ilene):**
   - 46 weeks captured (~**$351K** in 2026 YTD; recent weekly runs **$17K–$22K** for 12–13 workers).
   - Ilene's weekly Wednesday night emails (for Friday payday) combine **three distinct labor/sub categories** in one message:
     1. **W-2 Hourly Employees** (e.g., Filiberto Villegas `37.36–41.32 hrs`, David Lopez `39.43–41.30 hrs`, plus retro missed-clock-in adjustments).
     2. **Recurring 1099 Field Crew** (e.g., Anastacio "Tacho" Mujica `~$2,278–$2,435/wk`, Arnold Mujica `~$1,017–$1,439/wk`, Juan Torres `~$1,000–$1,230/wk`, Carlos Habana `~$833–$1,086/wk`, Jesus Mendoza `$800–$1,040/wk`, Cesar Olivares `$1,250–$2,500/wk`, Omar Peña `~$39K YTD` flat/run).
     3. **Trade Subcontractor Draw Checks** included on the Friday check run (e.g., Carlos Pedroza `$3,668–$19,850`, Randy Iribe `$4,750–$8,000` sometimes split into two `$4,000` checks, JBL Roofing `$250–$4,000`, GBD Painting `$4,750`, AD Concrete `$2,700`, Speedy Dirt `$2,800`, GG Flooring `$4,500`).

---

## 2. How Saddlewood Actually Operates Across the Five Accounting Domains

### A. Payroll & Field Labor (`crew_people`, `crew_shifts`, `crew_jobs`, `crew_job_phases`)
- **Daily Rhythm:** Crew members clock in and out on their phones (`/app`, `crew_shifts`). Each shift records `started_at`, `ended_at`, `break_min`, `job_id`, `job_name`, `day` (America/Phoenix), GPS distance from the geocoded jobsite (`fromJobM`), and `source` (`app`, `late` offline punch, `office`).
- **Time Fixes & Audit Trail:** Workers never edit their own time. They submit a `timefix` entry (`crew_entries`) or answer a bot `clockout` question; owners approve/adjust shifts with a preserved `edits` JSON audit log.
- **Trades on Labor:** Saddlewood self-performs **Framing** (wood & metal stud), **Drywall** (hang, tape, texture, level 4/5 finish), **Paint / Finish**, and **General / Demo / Cleanup**, plus **Supervision / PM** (Eli).
- **What the App Needs in Payroll:**
  - Every shift and worker needs a resolved **Trade** (`framing`, `drywall`, `paint`, `electrical`, `plumbing`, `general`, `supervision`)—from the shift override, the active job phase (`crew_job_phases.trade`), or `crew_people.trade`.
  - Pay calculation: `hours × pay_rate` (owners-only visibility per Spec §11.5 and Permissions Plan Decision C; PMs see hours by trade/job/person without dollar rates unless toggled in Company Policies).
  - Period views: **Today** (live on-the-clock + completed hours today), **WTD** (Mon–Sun payroll week), **MTD**, **YTD**, and **Custom** date range, with visual breakdowns by **Trade**, **Job**, and **Worker**.

### B. Purchases & Material Spend (`purchases`, `job_aliases`, `trade_map`, `crew_requests`, `crew_pickups`)
- **Sources of Spend:**
  1. **Home Depot Pro Xtra (`source = 'hd'`):** Imported at the receipt line-item level (`sku`, `description`, `qty`, `line_total_cents`, `department`, `class`, `store`, `order_ref`, `job_name_raw`).
  2. **Field Receipt Capture (`source = 'app'` / `crew_entries` where `kind = 'receipt'`):** Paper receipts photographed in the parking lot per SOP-001 (Sherwin-Williams, Arizona Building Supply, framing yards, tool rentals, out-of-pocket crew reimbursements).
  3. **Material Requests & Will-Call Pickups (`crew_requests` -> `crew_pickups`):** Crew requests material at EOD -> PM approves up to `$500` (`requests.pmLimitCents`), owner approves above `$500` (both owners notified above `$1,000`) -> ordered at supplier -> runner picks up and delivers with photo.
- **Trade Categorization:**
  - `trade_map` maps `(department, class)` to `framing`, `drywall`, `electrical`, `plumbing`, `paint`, `tools`, `rentals`, `general`.
  - **Gap to close in Phase 1:** Non-HD purchases and miscategorized `"general"` items (e.g., fasteners or specialty trim) need one-click **trade categorization** (single item or multi-select bulk action) and **job assignment** (`"Which job is this?"` queue integrated directly into Accounting > Purchases as well as Crew/Home).
- **Flags & Controls:**
  - Returns (`line_total_cents < 0`) netted against gross spend.
  - Small-trip alert: trips under `$75` (runner inefficiency metric on the job money card).
  - Price creep flag: SKU unit price > 20% above the 90-day lowest price.
  - Non-job overhead: `SHOP` PO (`SOP-001` rule 1) tracked explicitly as Shop / Overhead rather than polluting job cost or sitting unmatched.

### C. Accounts Payable (`subs`, `bid_packages`, `bid_invites`, `bid_responses`, plus new `ap_bills`)
- **What Exists in KB Operations:**
  - **Trade Subcontractors (SOP-004, SOP-008):** Mega Electrical (past-due demands on `6418 E Caron Dr` and `5203 N Monte Vista`), Medina Drywall, JBL Roofing, AD Concrete, GBD Painting, Carlos Pedroza, Randy Iribe, GG Flooring, Speedy Dirt.
  - **Material Vendors & Supplier Accounts (SOP-008 §1.F):** Home Depot Pro, Sherwin-Williams, Arizona Building Supply, Facings of America (tile order with `$28/pallet` storage fees & 100% non-refundable deposit).
  - **Zelle & Out-of-Pocket Reimbursements:** Weekly Zelle payments requiring job/trade allocation (`bot/accounting.py`) and crew receipts marked paid out-of-pocket (`crew_entries`).
- **Compliance Gates Before Paying a Sub (SOP-004 & SOP-008):**
  1. **Signed Work Order / Awarded Bid Package** matching the invoice SOV.
  2. **Onboarding Complete:** W-9 on file (`w9_on_file`), active COI (`coi_expires_on >= today`), verified AZ ROC license (`roc_verified_at`), signed MSA (`msa_signed_on`), ACH confirmed by phone (`ach_confirmed_at`).
  3. **Conditional Lien Waiver Received** for the current draw (SOP-008 rule 4: "Waivers go both ways").
  4. **Pay-When-Paid Alignment:** Sub payment cadence aligns with client draw collection or agreed Friday run.
- **Gap in Current Schema (to add via migration in T11):**
  - The database has `subs` and `bid_packages` (up to `awarded`), but **no `ap_bills` table** to track vendor invoices, sub draw bills, Zelle/reimbursement payables, due dates, retainage held, waiver status, payment method (`melio`, `check`, `ach`, `zelle`, `card`), and paid status. Adding `ap_bills` connects `subs` + `jobs` + `purchases` into a complete Accounts Payable ledger.

### D. Accounts Receivable (`clients`, `client_contacts`, `documents`, `document_events`, `payments`, `payment_allocations`)
- **Three Client Archetypes & Billing Profiles (`clients.billing`):**
  1. **A Finer Touch Construction (AFT — GC):**
     - Jobs: `Jury Residence (AFT 123, prefix 8009)`, `Peter Rabbit Residence (AFT 125, prefix 5203)`, `Carder Remodel (AFT 129, prefix 4125)`.
     - Cutoff: **23rd of each month** (and Friday weekly check-ins). Any invoice missing a signed **AFT Conditional Progress Waiver** is immediately rejected (Vanessa Winters, `2026-03-24` on `5203-11` `$31,196.40` and `2026-08-24` on `8009-9` `$50,000`).
     - Waiver match rule: AFT's waiver matches by **AFT job code + exact dollar amount** (when `8009-08` changed from `$50,000` to `$22,257.19`, the old waiver was invalid).
     - Payment method: **Melio ACH** (1% fee; gross recorded in `payments.amount_cents`, fee in `payments.fee_cents`).
  2. **Schifferer Built, LLC (Bellevue Heights Church AC938, prefix 9146):**
     - Delivery: Uploaded to **Built** pay-app portal (`portal_submitted` event with screenshot proof).
     - Cutoff: **20th of the month**.
     - Terms: **Pay-when-paid (10 days after GC is paid)** + **10% retention held** (`retainagePct = 10`, `payWhenPaidDays = 10`). Exempt from the automatic past-due ladder until a due date is set.
  3. **Direct Homeowners & Commercial TI (Powell `3526`, McHugh `12729`, Porter `4055`, McKague `4102`, Woodward `6402`, Deblasi `2217`, Abrams `2402` & `4632`, Kathy `7740`):**
     - Terms: 10% deposit at signing + progress draws on the **1st and 15th** (or biweekly SOV tracker workbook for Mark & Heather Powell on `3526 Emerson Street`).
     - Due in **7 days** from issue; late interest **1.5%/month** after a 10-day grace period.
- **The AR Collection Ladder (SOP-007 §5 & `src/lib/billing/ladder.ts`):**
  - `Unconfirmed`: Not viewed within **2 business days** of sending -> resend & ask AP to confirm receipt.
  - `Day -3`: Courtesy heads-up before due date.
  - `Day +1`: Past-due notice with delivery & viewing history attached; ask for payment date in writing.
  - `Day +7`: Second notice with PM copied + Statement of Account + interest accruing; **Ilene calls**.
  - `Day +14`: **Marco calls** with 1-page brief + written 5-day notice of intent to suspend work.
  - `Day +21`: Suspension of work / prompt-payment letter (GC).
  - `Day +30`: Counsel demand letter & lien calendar check (20-day prelim notice tracked in `job_watches`).
  - **Disputed Rule:** A disputed invoice (e.g., `5203-12` `$25,423` held over a chargeback, or Porter `4055`) is marked disputed and leaves the automated ladder.

### E. Billing & Invoices (`documents`, `document_exhibits`, `billing_previews`, `send_groups`, `progress_trackers`)
- **How Invoices Originate:**
  1. **Deposit Invoice (`<prefix>-01`):** Created automatically at Award (`10%` default per Company Policies).
  2. **SOV Progress Draw:** Percent complete per Schedule of Values line (`jobs.billing.sov` or `progress_trackers` for Powell), less prior billed and less retainage (`retainagePct`).
  3. **Change Order Invoice (`CO-<n>`):** Priced at cost + 20% OH&P (15% if capped by GC subcontract); ≥ `$1,000` requires written client signature on `/d/<token>` before work; ≥ `$5,000` bills 50% at signing.
  4. **Statements of Account (`statement`):** Multi-invoice summary per client (e.g. `AFT-100526`, `SB-100526`), excluding disputed items and invoices still inside the current cutoff window.
- **Package Check & Proof Record:**
  - Drafts have an uncounted preview link (`/d/p/<preview_token>`).
  - Issuing freezes `documents.snapshot` and mints `/d/<token>`.
  - Every send, delivery, bounce, human view (filtering out automated mail-scanner opens within seconds of delivery), and PDF download writes an immutable row in `document_events`.

### F. Job Costing (The Missing Tie-Together Category)
- Every active job has four financial pillars that must reconcile in one place (both on the Job Hub and in Accounting):
  1. **Contract & Approved COs:** Original Contract (`jobs.billing.contractCents`) + Approved Change Orders (`documents` where `kind = 'change_order'` and accepted/issued) = **Adjusted Contract**.
  2. **Billed & Collected (AR):** Total Invoiced (`documents` where `kind = 'invoice'` and `status = 'issued'`), Retainage Held, Total Paid (`payment_allocations`), Open Balance, Past-Due Balance.
  3. **Direct Job Costs (Actuals vs. Estimate Budget, Target ≤ 105%):**
     - **Labor Cost:** `SUM(crew_shifts hours × crew_people.pay_rate)` by trade.
     - **Material Cost:** `SUM(purchases.line_total_cents)` by trade (net of returns).
     - **Sub / AP Cost:** `SUM(ap_bills.amount_cents)` (or awarded `bid_packages` commitments vs billed) by trade.
  4. **Gross Margin:** `(Billed or Adjusted Contract) - (Labor + Material + Sub AP)` in dollars and `%` vs. Estimate Margin (`sales_estimates.sell_cents - cost_cents`).

---

## 3. Field & Schema Requirements Revealed by the KB

| Accounting Section | Primary Tables | Missing Fields / Schema Additions Needed |
|---|---|---|
| **Payroll / Labor** | `crew_shifts`, `crew_people`, `crew_jobs`, `crew_job_phases` | Shift-level `trade` (falling back to `crew_people.trade` or active phase trade) so hours & labor dollars break down cleanly by trade (`framing`, `drywall`, `paint`, `general`, `supervision`) across Today/WTD/MTD/YTD. |
| **Purchases** | `purchases`, `job_aliases`, `trade_map`, `crew_jobs`, `jobs` | Every purchase row categorized to a `trade` (no blank trades; manual override column/flag so user edits persist across `purchases_relink`); link from `crew_jobs.id` to `jobs.id` for unified project drill-down; support for non-HD vendors (`Sherwin-Williams`, `Arizona Building Supply`, `Sunbelt Rentals`, etc.). |
| **Accounts Payable** | `subs`, `sub_contacts`, `bid_packages`, `bid_invites`, **new `ap_bills`** | New `ap_bills` table: `id`, `vendor_name`, `sub_id` (nullable FK to `subs`), `job_id` (FK to `jobs`), `crew_job_id` (FK to `crew_jobs`), `bid_package_id` (nullable FK), `purchase_trip_key` (nullable), `invoice_number`, `category` (`subcontract`, `materials`, `rental`, `reimbursement`, `overhead`), `trade`, `issue_date`, `due_date`, `amount_cents`, `retainage_cents`, `paid_cents`, `status` (`draft`, `pending_approval`, `hold_waiver`, `hold_coi`, `ready_to_pay`, `paid`, `void`), `payment_method` (`melio`, `check`, `ach`, `zelle`, `card`), `waiver_status` (`not_required`, `missing`, `conditional_received`, `final_received`), `paid_on`, `reference`, `note`. |
| **Accounts Receivable** | `clients`, `client_contacts`, `documents`, `document_events`, `payments`, `payment_allocations` | Aging bucket computation (`current`, `1_7`, `8_14`, `15_30`, `30_plus`, `pay_when_paid`, `disputed`), Melio fee tracking (`payments.fee_cents`), retainage tracking, and client cutoff indicator. |
| **Billing / Invoices** | `documents`, `document_exhibits`, `send_groups`, `progress_trackers`, `job_watches` | Waiver package check indicator (e.g. AFT conditional waiver attached & amount matches invoice total), SOV draw progress link, and Change Order (`CO-<n>`) guard against billing over contract. |

---

## 4. Candidate End-to-End Scenarios for Phase 3 Testing

These five scenarios reflect real operations observed in the KB and will be seeded and driven end-to-end in Phase 3:

1. **Scenario 1 — AFT Friday/23rd Billing Week with Change Order & Waiver Check:**
   - Job: `8009 N Ironwood Dr (AFT 123 — Jury Residence)`.
   - Flow: Field crew logs extra framing/drywall work (`>$1,000`) -> priced as `CO-3` with 20% markup -> approved -> draw invoice `8009-15` drafted -> package check blocks send until AFT Conditional Progress Waiver matching the exact dollar amount is attached -> previewed and issued -> viewed event recorded -> paid via Melio with 1% fee (`payments.fee_cents`) -> AR balance updates to $0 and net cash reflects the Melio fee.
2. **Scenario 2 — Powell Residential Progress Draw & SOV Roll-Forward:**
   - Job: `3526 Emerson Street (Powell Residence)`.
   - Flow: Open biweekly SOV progress tracker -> update percent complete on Framing and Drywall Hang lines -> add a minor extra (`<$1,000`) -> generate invoice `3526-09` and workbook -> record client check payment -> roll progress forward into completed prior work.
3. **Scenario 3 — Crew Week with Hours by Trade, Time-Fix Request, and Payroll Export:**
   - Flow: 10+ workers clock shifts across Today, WTD, MTD, YTD on multiple jobs (`6402 E Bambi Drive`, `12729 W Keim Dr`, `3526 Emerson Street`, `9146 Bellevue Heights Church`) across `framing`, `drywall`, `paint`, and `general` -> one worker submits a missed-clock-out `timefix` -> owner reviews in Payroll, drills into `Trade: Drywall` -> `Job: 6402 E Bambi`, approves the time fix, and exports the WTD payroll sheet to CSV/XLSX for Ilene.
4. **Scenario 4 — Multi-Job Material Purchase Run & Unmatched Register Alias Resolution:**
   - Flow: Home Depot Pro Xtra lines + a Sherwin-Williams receipt arrive -> some carry a nickname (`"BAMBI"`, `"PETER RABBIT"`, `"SHOP"`) -> in Accounting > Purchases, owner views MTD breakdown by Trade and Vendor, filters to `Unmatched Job`, assigns `"BAMBI"` to `6402 E Bambi Drive` (creating a `job_aliases` row and relinking all matching lines), re-categorizes a hardware fastener line from `general` to `framing`, and exports selected framing purchases.
5. **Scenario 5 — Subcontractor Bid -> Leveling -> Award -> AP Bill -> Waiver Hold -> Payment:**
   - Job: `9146 Bellevue Heights Church` (or `6402 E Bambi Drive`).
   - Flow: 3 subs invited on an Insulation/Drywall bid package -> bids leveled with gap-plugging -> awarded to an onboarded sub -> sub submits invoice #1 (`ap_bills`) -> AP screen flags `Hold: Missing Conditional Waiver` -> waiver marked received -> status moves to `Ready to Pay` -> paid via Melio/Check -> drill-down from AP Bill shows linked Sub, Bid Package, and Job Cost impact.
