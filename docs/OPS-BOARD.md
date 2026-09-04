# Ops board and operating documents at /internal/ops

The internal portal now carries the company's operating model: the SOP library,
the role charter, the Bellevue handoff packet, and a live board of what still has
to be built before anyone can step into a role. Source of truth for the
documents is the Saddlewood-KB repo; the board's rows live in Supabase.

## Who can open it

Magic link (Supabase OTP, eight-digit code or link) for the allowlist in
`src/lib/ops/allowlist.ts`:

- marco@saddlewoodcontracting.com
- ilene8a@gmail.com
- info@saddlewoodcontracting.com
- bot@saddlewoodcontracting.com
- lando@saddlewoodcontracting.com

Two gates enforce it. The login page refuses other addresses before asking
Supabase for a code, and the internal layout signs out any session whose email
is not on the list, so a user created by other means still cannot get in.
`INTERNAL_ALLOWED_EMAILS` on Vercel (comma separated; the proxy has always read
it) replaces the list without a deploy, and so does `OPS_ALLOWED_EMAILS`. If the
Vercel variable is set today, add the new addresses to it or delete it so the
default list applies; otherwise the proxy bounces them before the page loads.

Supabase Auth issues no code for an address that is not already an Auth user
(`shouldCreateUser: false`). Create the five once:

```bash
vercel env pull .env.production.local
node --env-file=.env.production.local scripts/ops-invite-users.mjs
```

## Agents

The bot and Claude sessions use the same API with a bearer token:

```
Authorization: Bearer $OPS_AGENT_TOKEN
X-Ops-Actor: saddlewoodbot          # or claude-session, any short name
```

Set `OPS_AGENT_TOKEN` (32+ random characters) in Vercel for the site and in the
KB repo's environment for the bot. The CLI in the KB repo wraps it:

```bash
python3 bot/ops_board.py list
python3 bot/ops_board.py add --title "Daily log nag" --owner Lando --col drafting
python3 bot/ops_board.py move daily-log live
```

Every write records the actor in `ops_card_events`.

## Endpoints

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/ops/cards` | | `?archived=1` includes archived |
| POST | `/api/ops/cards` | `{id?, title, owner?, col?, note?, sort?}` | upsert by id; id defaults to a slug of the title |
| PATCH | `/api/ops/cards/:id` | any of `{title, owner, col, note, sort}` | a column change writes a move event |
| DELETE | `/api/ops/cards/:id` | | archives, never deletes |

Columns: `backlog`, `drafting`, `review` (owner review), `live`, `measured`.
Owners: `Marco`, `Lando`, `Ilene`, `Eli`.

## Deploying it

1. Run `supabase/migrations/0004_ops_board.sql` then `0005_ops_board_seed.sql`
   in the Supabase SQL editor (idempotent).
2. Add `OPS_AGENT_TOKEN` to the Vercel project. `SUPABASE_SERVICE_ROLE_KEY` and
   `RESEND_API_KEY` are already there. Check `INTERNAL_ALLOWED_EMAILS` (above).
3. Create the Auth users (above).
4. Merge the `ops-board` branch. Vercel deploys it.
5. Send Marco and Ilene the link `https://saddlewoodcontracting.com/internal/ops`.
   They enter their email, get the code, and are in.

## Keeping the documents current

Edit the markdown in Saddlewood-KB, then:

```bash
python3 scripts/sync_ops_docs.py      # in Saddlewood-KB
```

That regenerates `src/content/ops/docs.generated.ts` here. Commit and push the
site. The generated file is the only copy the site holds; do not edit it.
