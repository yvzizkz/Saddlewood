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

Not patched, on purpose: `crew.py`. Its `/api/expenses` copy of an app
receipt is recognized (`appEntry`) and not entered twice; the receipt is
already in purchases through `/api/bot/purchases`. It keeps working as is.

Every patch is retry-safe (the site keys each item, so a resend never
enters it twice) and leaves the old endpoints working.
