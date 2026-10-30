# Change-order intake

A client asks for a change by email. The system turns that request into a numbered draft with every price blank. An owner prices it and sends it, and the app follows it through to paid. Nothing reaches a client until an owner presses Send. The source brief is KB `bot/work/20261030-aft-jury-cos/duo-prompt-co-intake.md`.

| Step | Where | State |
|---|---|---|
| 1. The Mac reads the email, decides whether it is a CO request from a known client contact on a known job, and posts it | KB `bot/triage.py` → this API | KB PR |
| 2. Each change becomes a register row (awaiting price) and a $0 draft, numbered now | `POST /api/change-orders/intake` (0059) | #70 |
| 3. The owner opens "Price it" from the push, types the prices and presses Send | `/app/changes/<id>` | #71 |
| 4. A timeline per CO (every register move, plus the client's openings from the document's proof record), then nudges when it ages | `change_order_events` (0059), `lib/billing/coTimeline.ts`; job Changes tab and `/app/changes/<id>` | timeline: #72; nudges: next |
| 5. The client approves on the CO's own link (click, signature, upload), or the owner confirms an approval that came in by email | `/d/<token>` | next |

## Numbers

A change order's number is reserved when its draft is made, so the app, the PDF and the email all agree from the start. On a job with a number prefix the form is `<prefix>-CO<n>` (Jury: `8009-CO10`, which is how clients have seen them); without a prefix it is `CO-<n>`. The next number is one past the highest CO sequence in the job's register rows and change-order documents, voids included. `CO-4` and `8009-CO7` count as one sequence (`src/lib/billing/numbering.ts`).

Numbers never come from Joist, because Joist hands out its own. Pricing a CO keeps the number intake gave it. A CO recorded by hand still gets its number when it is first priced, in the same form.

## The API (for the Mac)

`POST /api/change-orders/intake`. It takes the agent token (`Authorization: Bearer $OPS_AGENT_TOKEN`, `X-Ops-Actor: bot`) or an owner's session. The body is read strictly, and an unknown field is refused by name:

```json
{
  "sourceRef": "<mail thread id>",
  "job": "8009-n-ironwood-dr",
  "requestedBy": "Chris Turner (AFT)",
  "requestedOn": "2026-10-30",
  "subject": "Sheer wall change at garage",
  "terms": "optional; printed under the lines",
  "items": [
    {
      "key": "shear-wall",
      "title": "Shear Wall Revision at Studio / Garage Door",
      "detail": "optional, for the register",
      "refs": "Broderick Engineering SK8, SK9 and SK10 dated 10/29/26",
      "note": "optional",
      "lines": [{ "description": "Hold-Downs at Revised Shear Wall", "quantity": 10, "unit": "ea", "note": "Set in epoxy per SK8." }],
      "notIncluded": [{ "description": "Paneling, finishes and door supply", "note": "By others" }]
    }
  ]
}
```

- `job` is the billing job id, the crew job id, or the job page key. A job with no billing record gets a 409.
- Each request takes 1 to 10 items, and each item 1 to 30 lines. Lines have no price: an `amountCents` field is refused.
- `key` must stay the same for the same change when the request is sent again or answered in the thread. Use letters, digits, `.`, `_` and `-`; case doesn't matter.

The answer is `201` when anything was created, otherwise `200`:

```json
{ "ok": true, "changeOrders": [
  { "key": "shear-wall", "changeOrderId": 12, "number": "8009-CO10", "documentId": "…", "previewLink": "https://…/d/p/…",
    "action": "created" }
] }
```

`action` is one of:
- `created`: a new row and draft.
- `unchanged`: the same request again.
- `updated`: the request changed, and its draft was untouched, so it was rewritten.
- `kept`: an owner has the CO now (they edited the draft, priced it, or it was sent). `reason` says which, and nothing was changed.

The request's files go onto each draft afterwards through `POST /api/billing/documents/<documentId>/exhibits` (`{label ≤ 60, file: {filename, content: base64}}`, PDF/PNG/JPG/XLSX). They stay out of the intake body because Vercel caps a request at 4.5 MB. Add files only when `action` is `created`, so a re-run doesn't attach them twice.

## Rules

- **Untrusted text.** Email text never goes into a `claude -p` argument. It goes to a file the agent reads, with `@` stripped and people numbered instead of addressed (KB CLAUDE.md).
- **No sending.** Intake only makes drafts.
- **The live AFT drafts** 8009-CO7/8/9 (`change_orders` 1–3 on prod) were made by hand. Leave them alone.
