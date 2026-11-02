# Joist sync

While Joist is still in use, every change order the app drafts, prices or gets signed is copied into Joist as an estimate, so the two never disagree (CO intake brief, KB `bot/work/20261030-aft-jury-cos/duo-prompt-co-intake.md` §7).

**The site never talks to Joist** and holds no Joist credential. Joist has no write API; the Mac bot writes through its signed-in browser (`bot/browser.py`, the same way 8009-CO7/8/9 were made) and checks the result through the Joist read API (`bot/joist.py`). The site keeps the queue and what came back. **The app is the record and Joist is a copy:** nothing here ever blocks Save or Send.

> **Owner risk, flagged for the owner's call:** Joist's terms §2.3(c) forbid automated access. The vault decision of 2026-07-20 rejected browser automation for that reason. The owner's CO brief (10/30) asked for this sync, the bot was already writing to Joist this way, and on 11/01 the owner said to build it. If Joist objects, turn the Mac worker off; the site side is harmless left idle.

## How it moves

| When | Reason queued |
|---|---|
| Intake makes the draft, or a re-sent request rewrites it | `drafted` |
| An owner saves prices on Price it, sends it, prices it on the register, or changes its amount | `priced` |
| It is marked signed | `signed` |
| An owner taps **Try again** after a failure | `retry` |

- **One waiting job per change order.** More changes before the Mac claims it fold into that job, which takes the newest reason. A change made while a job is claimed queues a new one, so the latest always gets written.
- **The claim hands over the change order as it is now,** not as it was when queued.
- **A claim lasts 15 minutes.** A job claimed and never reported can be claimed again after that.
- **Failures:** a failed write goes back in line, up to 3 tries in total. After the last one, the change order is flagged (`joist_error`). The CO page shows the error with **Try again**, and the timeline shows a warning line.
- **Success:** stores `joist_id`, `joist_url` and `joist_synced_at` on the change order and adds a timeline line ("Copied to Joist (estimate N)"). While the document is still a draft, it also adds the link as an exhibit labelled "Joist estimate". An issued document is never changed.

## The Mac's side (bridge token: `Authorization: Bearer $OPS_AGENT_TOKEN`)

**Claim:** `POST /api/bot/joist-sync` `{ "limit": 10 }` (optional, max 10) →

```json
{ "ok": true, "jobs": [{
  "jobId": 12, "changeOrderId": 41, "reason": "priced", "attempt": 1,
  "joistId": null,
  "number": "8009-CO50", "title": "Shear Wall Revision", "status": "sent",
  "client": { "name": "A Finer Touch Construction", "attention": "Chris Turner (AFT)" },
  "job": { "name": "8009 N Ironwood Dr (Jury AFT 123)", "address": "8009 N Ironwood Dr, Paradise Valley, AZ 85253" },
  "lines": [{ "description": "Hold-Downs", "quantity": 10, "unit": "ea", "note": "…", "amountCents": 190000, "noCharge": false }],
  "notIncluded": [{ "description": "Paneling", "note": "By others" }],
  "note": "Requested by …", "totalCents": 310050,
  "attachments": [{ "label": "SK8", "url": "https://…/api/bot/joist-sync/12/files/<exhibit id>" }]
}]}
```

- `joistId: null` means create a new estimate: duplicate a document on the same client (the `/dashboard/documents/estimates/<id>/duplicate` deep link works). Otherwise update that estimate. Open new records from the list search, because their edit links say "Record not found".
- **Always overwrite Joist's pre-filled number with `number`.** The price field needs select-all and backspace. Save as a draft and **never email from Joist**.
- Attachment URLs under `/api/bot/joist-sync/…/files/…` need the same bearer token and work only while the job is claimed. They are not the client's link, so downloading them doesn't count as the client opening anything.
- The browser profile lock is shared with other bot jobs, so hold it briefly.

**Report** (after reading the estimate back through the Joist read API): `POST /api/bot/joist-sync/<jobId>`

```json
{ "ok": true, "joistId": 52782795, "joistUrl": "https://…joistapp.com/…" }
{ "ok": false, "error": "what went wrong" }
```

The answer is `{ "ok": true, "status": "done" | "queued" | "failed" }`. Reporting a job that isn't claimed returns 409. `joistUrl` must be a `joistapp.com` link.

**List:** `GET /api/bot/joist-sync` returns the newest 50 jobs, for the Mac's own dashboard.

## Tables (0060)

- `joist_jobs`: `change_order_id`, `reason`, `status` (queued / claimed / done / failed), `attempts`, `claimed_at`/`by`, `finished_at`, `joist_id`, `joist_url`, `error`. Service-role only.
- `change_orders` gains `joist_id`, `joist_url`, `joist_synced_at` and `joist_error`.

Tests: `src/lib/billing/__tests__/joistSync.test.ts` and `e2e/joist-sync.spec.ts`.
