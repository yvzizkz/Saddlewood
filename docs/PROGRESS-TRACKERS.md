# Progress payment trackers

`/internal/trackers` — the schedule-of-values workbook Saddlewood sends the
owners of a residential job at each draw (the Powells first). Marco bills a
line, taps **Save & generate**, and the workbook arrives in his inbox to
forward from his own mailbox.

## How it fits together

- **State** — one JSON document per job in `progress_trackers` (migration
  `0008`): project names, invoice number and date, payments received, the
  line items (contract, change orders, completed before this invoice, this
  invoice, draw, TBD, note), pending change orders, notes mode, and the
  previous invoice (what it billed and what was paid). Shape and validation:
  `src/lib/trackers/types.ts`. The same JSON is read by `build_tracker.py` in
  the Powell Progress folder, so a workbook can always be rebuilt locally.
- **Arithmetic and wording** — `src/lib/trackers/core.ts`. Per line: current
  total = contract + change orders; completed = prior + this invoice; status
  (complete / in progress / not started / TBD); previously performed = total ×
  % − this invoice; current due = this invoice + draw. The notes block is
  composed from the numbers unless Marco writes his own.
- **Workbook** — `src/lib/trackers/workbook.ts` (ExcelJS, server only). Same
  rows, colours, and formulas as the hand-built trackers #3526-03 … #3526-08.
  `workbook.test.ts` compares every cell against Python-built fixtures.
- **Email** — `src/lib/trackers/email.ts` through the existing Resend sender
  (`lib/auth/magicLink.sendEmail`), workbook attached, to the person who
  generated it (the session email; `MARCO_EMAIL` when an agent token calls).
- **Snapshots** — every generated invoice is kept in
  `progress_tracker_invoices` with where it was sent; History on the page
  downloads or restores any of them.

## API (portal session or `OPS_AGENT_TOKEN`)

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/trackers` | list trackers with due and % complete |
| GET | `/api/trackers/{id}` | state + invoice snapshots |
| PUT | `/api/trackers/{id}` | save state; `baseUpdatedAt` guards against a second editor (409 returns the current row) |
| POST | `/api/trackers/{id}/generate` | save, build, email, snapshot, mark issued. `force` skips the $0 and over-billing guards; `send:false` builds only; `to` adds allowlisted recipients |
| GET | `/api/trackers/{id}/workbook?invoice=N` | the workbook (live state, or the snapshot for invoice N) |
| POST | `/api/trackers/{id}/roll-forward` | the owner paid: record payment, fold progress into completed, open the next number |
| GET | `/api/trackers/{id}/invoices/{N}` | one snapshot's full state (Restore) |

## Adding a job

Insert a row in `progress_trackers` with the JSON state (see the Powell seed
in migration 0008 for the shape). Line ids are lowercase slugs; amounts are
plain numbers. The page and API do the rest.

## Local rebuild

```bash
# in the Powell Progress folder
python3 pull_tracker_state.py   # GET /api/trackers/powell with OPS_AGENT_TOKEN → powell_tracker_state.json
python3 build_tracker.py        # → Powell_Progress_Payment_Tracker.xlsx (identical to the portal's)
```
