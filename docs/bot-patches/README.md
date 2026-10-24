# Bot patches (KB repo)

Changes the KB bot needs for a site PR, ready to apply. The site session
writes them; the KB session reviews each one, applies it on a KB branch,
runs it against a local stack, and lands it only after the site side is
live on prod. The bot runs every minute from launchd, so a landed change
takes effect at once.

Apply from the KB repo root: `git apply --check <patch>`, then `git apply <patch>`.

| Patch | Needs live first | What it does |
|---|---|---|
| `expenses-accounting.py.patch` | PR #54 and migration 0053 | A new Zelle payment goes to `/api/expenses` as the whole item (today only its number goes, which the site cannot enter). A send that fails is retried on the next mail scan (`portalSynced`); the old page's five seed payments are never sent. The tagging links point at Purchases > Tag spend. |
| `expenses-receipt_ocr.py.patch` | PR #54 | The receipt reply links Purchases > Tag spend instead of the retired page. |
| `payments-accounting.py.patch` | PR #56 and migration 0054 | After Joist takes a P<n>, the same payment goes to `/api/bot/payments` (one row in the app's payments, source 'bot', keyed by the P number). Retried on the next record, the weekly check-in, or `accounting.py --push-payments`, with backoff; a refusal (no such invoice in the app, it would overpay) is logged on the 1st, 5th and 20th try. Joist stays exactly as it is. Only payments recorded after it is installed go: its first run marks every P already recorded `app.status: 'pre-cutover'` (on 2026-10-23 that is P1–P6, about $150,957, already on Money by hand) and never sends them. |

The two `accounting.py` patches touch different places and apply in either
order.

Dry run of the payments cutover, against a temp copy (no live file, no
network): `check_payments_cutover.py`. Its docstring has the three commands;
it prints `PASS` when the already-recorded P numbers are skipped and a newly
recorded one is sent once.

Not patched, on purpose: `crew.py`. Its `/api/expenses` copy of an app
receipt is recognized (`appEntry`) and not entered twice; the receipt is
already in purchases through `/api/bot/purchases`. It keeps working as is.

Every patch is retry-safe (the site keys each item, so a resend never
enters it twice) and leaves the old endpoints working.
