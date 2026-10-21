# Phase 3: every department's real week, run through the app

**Written:** 2026-10-20. Source: `docs/KB-OPERATIONS-MODEL.md` §4 (the candidate scenarios from the KB), the operating model's cadence (OM §4), and SOP-001 to SOP-009.
**How they run:** Playwright (`e2e/*.spec.ts`) against `npm run dev` on port 3100, on this worktree's own local stack (`saddlewood-cohesive`, ports 553xx) with the synthetic seed. Never production, and never the `e2e` stack on 54321: `e2e/support/env.ts` refuses any other Supabase URL.
**Run:**
```
supabase start -x vector,logflare,edge-runtime,realtime
scripts/local-db.sh --reset        # schema, migrations, synthetic seed
npm run dev -- -p 3100             # in another terminal
npx playwright test                # all scenarios; or e2e/finance-week.spec.ts
```

Each scenario drives the screens a person in that seat would use, writes through the app's own APIs (never SQL), and asserts the numbers on every screen it touches. Where something can't be done in the app, the gap is recorded here and fixed if it's in reach.

| # | Week | Seat that drives it | Spec | Status |
|---|---|---|---|---|
| 1 | **Finance:** AFT billing week. Cutoff calendar, CO through to billing, waiver owed and received, AR and Melio fee, Friday pay run, payroll export | Finance (Ilene) | `e2e/finance-week.spec.ts` | **done (6/6)** · claude |
| 2 | **Owner:** Monday decisions, a CO priced, AR 14+ days, who-decides change moves work, a task handed to the PM and closed, the job page agrees with Accounting | Owner (Marco) | `e2e/owner-week.spec.ts` | **done (5/5)** · claude |
| 3 | **PM access & week:** what a project manager can and can't open in Accounting; his own Jobs list, job tabs (no labor $/margin/sub bills/draw controls), field change requests, and scoped Tasks (Mine / My jobs) | PM (Eli) | `e2e/pm-access.spec.ts`, `e2e/pm-week.spec.ts` | **done (8/8)** · claude, agy |
| 4 | **Field and crew:** hours by trade across two jobs, a far punch, a time fix, receipts into Purchases, the 6 PM daily log, a pre-cover checklist that blocks a phase, a will-call pickup | Field lead / crew | `e2e/field-week.spec.ts` | **done (5/5)** · agy |
| 5 | **Purchasing:** Home Depot run split across jobs, an unmatched register name assigned, a line re-tagged to a trade, export of selected lines | Finance / PM | `e2e/purchasing-week.spec.ts` | **done (4/4)** · agy |
| 6 | **Subs:** package → invites → leveling → award under $10k by the PM → work order → no-COI block → bill → waiver hold → payment | PM / Finance | `e2e/subs-week.spec.ts` | **done (4/4)** · agy |
| 7 | **Sales admin:** lead with source → estimate → no follow-up in 5 days escalates → proposal → award builds the job | Sales (Marco covering) | `e2e/sales-week.spec.ts` | **done (2/2)** · agy |
| 8 | **Powell progress payments:** percent complete on the SOV, a minor extra, invoice, check, roll-forward | Finance | `e2e/powell-draw.spec.ts`, `e2e/draw-void.spec.ts` | **done (3/3)** · agy, claude |

## 1. Finance: the AFT billing week (Ilene)

**Monday to Friday, around AFT's 23rd cutoff:**
1. **Billing › Next to bill.** AFT shows "Closes the 23rd · Email" and needs a conditional waiver. The PM's % complete is due 3 business days before. The same dates appear in Tasks (the PM's % complete; Finance's invoice package).
2. **A change in the field becomes a CO.**
   - Recorded on the job's Changes tab, then priced: it gets its CO number.
   - Marked signed: Tasks shows "Bill CO-n" for Finance.
   - Marked billed: it leaves Tasks.
3. **Waivers.**
   - Every issued AFT invoice without a waiver is "Missing" on Billing › Lien waivers and in Finance's tasks.
   - Recording the waiver on the invoice's page turns it "Received", and it leaves both lists.
4. **Receivables.**
   - The open total equals the sum of the rows.
   - Narrowing to AFT gives AFT's rows only; the breadcrumb says so.
   - Collected (month) shows Melio's fee apart: gross − fee = net.
5. **Payables › Friday pay run.** "Ready for Friday" equals the bills due by Friday. A sub bill missing its waiver is on hold.
6. **Payroll, week to date.** Hours by trade sum to the total. Export to CSV downloads a file whose rows match the table.

## 2. Owner: Marco's week

1. **Departments › Owner.** Decisions waiting, COs to price, money owed 14+ days late, and items moved up to him, each a link into the place it's acted on.
2. **A CO is priced from the job page.** It leaves "to price" and lands with Finance.
3. **Who decides.**
   - Put Lando in Finance's seat: Finance's department shows "held by Lando", and Finance's tasks are in Lando's "Mine".
   - Put Ilene back.
4. **A task is handed out.**
   - New task to the PM on a job, due yesterday: it shows on the job's Tasks tab.
   - After the grace days it shows moved up to Owner decisions.
   - Done closes it.
5. **The job page agrees with Accounting.** Job › Money "Open" equals Receivables narrowed to that job.

## 3. PM access & week (Eli)

| Can | Can't |
|---|---|
| Accounting › Overview, Payroll hours, Purchases, Receivables, Billing, on his jobs only | Payables, Job costing (unless `policy.pm.margin`), Departments |
| Open his own job's invoice, read only | See pay or labor dollars (unless `policy.pm.laborCost`), record a payment, open another job's invoice (404) |
| Open `Jobs` (his assigned jobs only, with `Materials on jobs` KPI and no `Margin` column) and every tab on his jobs (`Overview`, `Schedule`, `Log and QA`, `Money`, `Labor`, `Purchases`, `Subs`, `Changes`, `Documents`, `Tasks`, `Crew and phases`) | Open an unassigned job (`404`), see sub/vendor bills, create an SOV draw invoice (`Make the draft invoice`), or price/sign a change order (`403`) |
| Record a change request on his job's `Changes` tab (`Awaiting price`), hand tasks to `PM` or `Field and crew` on his jobs, and close his own or field-lead tasks from `Tasks` (`Mine` / `My jobs`) | Hand tasks to `Owner`, `Finance`, `Sales`, or `Operations` (`403`), or create/close tasks on an unassigned job (`404`) |

## 4. Field and crew: the field week (Mateo / Eli)

1. **Hours by trade.** Job › Labor hours on `9146 W Hutton Dr` match the table footer and equal `Accounting › Payroll` narrowed to that job.
2. **Schedule & Wednesday 2-week GC look-ahead.**
   - `Schedule` renders the week board and the Wednesday 2-week GC look-ahead draft (`?view=lookahead&job=9146-w-hutton-dr`).
   - Adding a will-call delivery on `Job › Schedule` and marking it `Done` updates its state in place.
3. **Out-of-pocket field receipt (`paidBy = "me"`).**
   - Logged on `Job › Log and QA`, it normalizes into `Accounting › Purchases` and creates a crew reimbursement bill (`REIMB-ENTRY-*`) in `Accounting › Payables`.
4. **6:00 PM EOD daily log (`SOP-006`).**
   - Filing an EOD log with a field directive records the log on `Job › Log and QA`, creates an `Awaiting price` change order on `Job › Changes`, and surfaces a `Change order to price` work item in `Tasks` for the Owner seat.
5. **Pre-cover quality checklist (`SOP-009`) & room/wall-face punch.**
   - An open pre-cover checklist on a phase blocks `phase.verify` (`409` with the open gate name) until the checklist is passed.
   - Room/wall-face punch items are added and marked done in place.

## 5. Purchasing: Home Depot & supply-house week

1. **KPI vs table total & trade drill-down.** `Purchases` MTD headline equals the `Items` table total and the `Trips` table total; drilling by `trade=framing` narrows every row and updates the breadcrumb.
2. **"Which job is this?" unmatched register PO.** Assigning `"BAMBI BACKYARD"` (`$672.00`) to `6402-e-bambi-drive` removes it from the unassigned banner and increases that job's `Materials` KPI by exactly `$672.00`.
3. **Receipt trip detail & manual trade override.** Opening a trip detail page (`/app/accounting/purchases/trip/[key]`) and re-tagging a line item's trade persists across reloads.
4. **CSV export.** Exporting `Purchases` WTD to CSV downloads a file whose row count matches `data-rows`.

## 6. Subs: the subcontractor & compliance week (`SOP-008`)

1. **Compliance & Scorecard (`S8`).** `Subs › Compliance & Scorecard` and `Job › Subs` show COI status (expired / expiring within 30d / valid), missing W-9/MSA counts, mobilization gate status, bid hit rate, and open AP per sub.
2. **Awarded package (`S6` & `S7`).** Opening an awarded package (`/app/subs/bids/e0000001-0000-4000-8000-000000000001`) renders the frozen Work Order (`WO-9440-INSU`), mobilization gate badge, and copyable Award & Thank-you email drafts (`Never auto-sent`).
3. **End-to-end package → invites → public sub bids → leveling → award under $10k.**
   - Creating a package, inviting two subs, submitting signed bids via `/bid/[token]`, and applying a scope leveling adjustment flips `"Lowest leveled"` vs `"Lowest total, not lowest leveled"`.
   - Awarding to a sub with an expired COI renders `"Hold — do not mobilize"` on the frozen Work Order.
4. **No-COI & missing-waiver payment hold.** Recording a sub bill without a conditional waiver places the bill on `Hold — Waiver` in `Payables`, blocks `pay` (`409`) and `approve`, and clears once `waiver_received` is recorded.

## 7. Sales: the sales & estimating week (`SOP-001` & `SOP-005`)

1. **Department home & >5-day follow-up escalation.** `Departments › Sales` shows open pipeline, win rate, `"No next step or past it"`, and win rate by source; an opportunity 6 days past its follow-up date escalates to `Owner` in `Tasks`.
2. **Lead → Estimate → Proposal → Won → Award → Gate 0 Handoff Packet (`A10`).** Creating a referral lead, pricing a framing & drywall estimate, issuing a frozen proposal, marking it won, and running Award creates the linked billing + field job, seeds template phases & pre-start watches, and populates the `Gate 0 Handoff & Watches` card on the new job's Overview tab.

## 8. Powell: schedule-of-values progress draws

1. **Joist cutover opening, guards, Draw #1 → issue → check payment, and Draw #2 roll-forward.**
   - Setting/verifying the pre-app opening percents (`action: "opening"`) on `3526 Emerson Street (Powell)` shows `$298,500 of $420,000 ($298,500 of it before the app)` on `Job › Money`.
   - Entering a percent lower than billed-to-date (`85%` vs `90%`) triggers the backward-percent guard (`Issue a credit instead`) and disables `"Make the draft invoice"`.
   - Advancing Framing (`90% → 95%`, `+$8,250`) and Drywall (`75% → 85%`, `+$12,500`) previews `$20,750` due on the draw and creates the draft invoice; a second draw while the first is still a draft is refused (`409`).
   - Issuing Draw #1 and recording Powell's `$20,750` check payment updates `Billed to date` to `$319,250 of $420,000`, and Draw #2 (`Finish 45% → 65%`, `Tile 40% → 50%` = `$21,500`) rolls forward from the new baseline.
2. **Signed minor extra (Change Order) + client retainage.**
   - Creating, pricing (`$2,500`), and signing a change order on `9146 W Hutton Dr` (`10%` retainage) adds the signed CO to the `Progress billing` schedule.
   - Billing the CO to `100%` previews `$2,500` gross, `−$250` retainage held (`10%`), and `$2,250` due, creates the draft invoice, and automatically marks the CO `billed`.
3. **Voiding a draw that billed a change order** (`e2e/draw-void.spec.ts`).
   - Voiding the issued draw puts the CO back to `Signed, not billed` on Changes and back on the schedule at `0%`, ready to bill again. Before the fix it stayed `billed` against a void invoice and dropped off both lists, so its money was never billed.

## What an owner, a PM and finance can and can't do today

From the runs on 2026-10-20: `npx playwright test` passes **37/37**, twice in a row (Finance 6, Owner 5, PM access & week 8, Field 5, Purchasing 4, Subs 4, Sales 2, Powell SOV draws 3).

### Real bugs caught and fixed by the Phase 3 scenario suite
1. **Trip detail route 404 (`src/lib/accounting/purchases.ts`):** `loadPurchaseTrip` ran `computeTripKey(decoded)` on an already-computed `tripKey`, stripping the last `:segment` and returning 404 on `/app/accounting/purchases/trip/[key]` links. Fixed to match `trip_key.eq.${decoded}` alongside `tk` and `source_key`.
2. **Out-of-pocket field receipt reimbursement bill (`src/lib/field/ops.ts`):** `syncReceiptEntryToPurchases` used `.upsert(..., { onConflict: "bill_number,vendor_name" })`, which PostgREST rejected because `bills_vendor_number_uidx` is an expression index on `lower(vendor_name)`. Fixed to check `bill_number` and insert cleanly.
3. **6 PM EOD daily log directive to Change Orders (`src/lib/field/ops.ts`):** `syncEodDirectivesAndDecisions` created the `work_items` (`co_price`) task but did not insert the `requested` row into `change_orders`, so field directives did not appear on `Job › Changes`. Fixed so EOD directives populate both `change_orders` and `work_items`.
4. **Field punch status & multiple punch items (`src/app/api/field/route.ts`):** `punch.status` updated non-existent columns `completed_at`/`completed_by` instead of `done_at`/`done_by`, and `punch.add` hardcoded `source: "field"` which collided with `work_items_source_uidx` on the second open punch item. Both fixed.

| Seat | Can, end to end in the app | Can't yet (gap → where it goes) |
|---|---|---|
| **Owner** | Read every department's figures and what waits on it; price, sign and bill a CO from the job page; move a seat and see the work follow; hand a task to a role and watch it move up when overdue; close it; see the job page agree with Receivables to the cent | Record a payment from a P-number match in the app; it still goes through Joist (bot path). Approve and send an invoice package in one step: the package is a checklist and a task today, and sending is the Bill screen |
| **Finance** | See each client's cutoff and what must go with the invoice; get told to bill a signed CO; record a lien waiver on the invoice (gap fixed in this phase); bill SOV progress draws by percent complete with retainage and signed COs (`0041`); read AR with aging, proof and the ladder; split Melio's fee from the gross; see Friday's pay run and the holds; export payroll that matches the table | Record a sub's incoming waiver from a standalone waiver form on the bill page (the bill page toggles `waiver_received`, and `/api/waivers` records directional rows) |
| **PM** | Open Overview, Payroll hours, Purchases, Receivables and Billing on his own jobs; open his own invoices read-only; open `Jobs` and his assigned job pages across all 11 tabs; record field logs, punch, checklists, receipts, and change requests (`Awaiting price`); hand tasks to `PM` or `Field and crew` and close them in `Tasks` (`Mine` / `My jobs`); reach `My jobs` and `Tasks` from crew `More` | See pay, labor dollars or margin (by policy, unless an owner switches them on); Payables; Departments; unassigned jobs (`404`); pricing or signing a change order (`403`); creating an SOV draw invoice (`403`) |
