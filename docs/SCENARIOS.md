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
| 1 | **Finance:** AFT billing week. Cutoff calendar, CO through to billing, waiver owed and received, AR and Melio fee, Friday pay run, payroll export | Finance (Ilene) | `e2e/finance-week.spec.ts` | claude |
| 2 | **Owner:** Monday decisions, a CO priced, AR 14+ days, who-decides change moves work, a task handed to the PM and closed, the job page agrees with Accounting | Owner (Marco) | `e2e/owner-week.spec.ts` | claude |
| 3 | **PM access:** what a project manager can and can't open in Accounting | PM (Eli) | `e2e/pm-access.spec.ts` | claude |
| 4 | **Field and crew:** hours by trade across two jobs, a far punch, a time fix, receipts into Purchases, the 6 PM daily log, a pre-cover checklist that blocks a phase, a will-call pickup | Field lead / crew | `e2e/field-week.spec.ts` | agy |
| 5 | **Purchasing:** Home Depot run split across jobs, an unmatched register name assigned, a line re-tagged to a trade, export of selected lines | Finance / PM | `e2e/purchasing-week.spec.ts` | agy |
| 6 | **Subs:** package → invites → leveling → award under $10k by the PM → work order → no-COI block → bill → waiver hold → payment | PM / Finance | `e2e/subs-week.spec.ts` | agy (after step 7) |
| 7 | **Sales admin:** lead with source → estimate → no follow-up in 5 days escalates → proposal → award builds the job | Sales (Marco covering) | `e2e/sales-week.spec.ts` | agy (needs a sales seed) |
| 8 | **Powell progress payments:** percent complete on the SOV, a minor extra, invoice, check, roll-forward | Finance | `e2e/powell-draw.spec.ts` | **blocked**: SOV percent-complete billing is not built (plan Phase 2 step 6, still open). The Powell tracker (`/internal/trackers`) is the path today |

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

## 3. PM access (Eli)

| Can | Can't |
|---|---|
| Accounting › Overview, Payroll hours, Purchases, Receivables, Billing, on his jobs only | Payables, Job costing (unless `policy.pm.margin`), Jobs, Departments, Tasks (owners' screens today) |
| Open his own job's invoice, read only | See pay or labor dollars (unless `policy.pm.laborCost`), record a payment, open another job's invoice (404) |

## What an owner, a PM and finance can and can't do today

From the runs on 2026-10-20: `npx playwright test` passes 16/16, twice in a row (Finance 6, Owner 5, PM access 5).

| Seat | Can, end to end in the app | Can't yet (gap → where it goes) |
|---|---|---|
| **Owner** | Read every department's figures and what waits on it; price, sign and bill a CO from the job page; move a seat and see the work follow; hand a task to a role and watch it move up when overdue; close it; see the job page agree with Receivables to the cent | Record a payment from a P-number match in the app; it still goes through Joist (bot path). Approve and send an invoice package in one step: the package is a checklist and a task today, and sending is the Bill screen |
| **Finance** | See each client's cutoff and what must go with the invoice; get told to bill a signed CO; record a lien waiver on the invoice (gap fixed in this phase); read AR with aging, proof and the ladder; split Melio's fee from the gross; see Friday's pay run and the holds; export payroll that matches the table | Record a sub's incoming waiver from a screen: the API takes it (`POST /api/waivers` direction in), the bill page has no button yet → step 7 (agy, subs and compliance). SOV percent-complete billing → still open in Phase 2 step 6 |
| **PM** | Open Overview, Payroll hours, Purchases, Receivables and Billing on his own jobs; open his own invoices read-only; reach it from crew More | See pay, labor dollars or margin (by policy, unless an owner switches them on); Payables; Jobs, Departments, Tasks (owners' screens, so a PM can't create or close tasks in the app yet) → next: open Tasks and the job page to PM seats on their jobs |
