# The Saddlewood app at /app

SaddleWoodBot from a phone, for Saddlewood staff only. It installs to the home
screen on iPhone and Android from a link (it is a web app; there is no App
Store listing), and it sits on the portal's existing sign-in and allowlist.

The link to send someone: `https://saddlewoodcontracting.com/app`

## What is in it

| Tab | What it is for |
|---|---|
| Home | Oversight. Drafts waiting on your OK (read, approve and send, send later, cancel), payments and bid invites to clear, what the bot is working on, what it is waiting on from other people, recent activity, bot health. |
| Ask | Delegation. A conversation with the bot, with photos and files. Same agent, rules and memory as a text or an email to it. Short commands (`drafts`, `approve 4`, `payments`) are answered in seconds. |
| Duties | Standing to-dos (`bot/tasks.json`), recurring duties the bot carries out on a schedule, and the built-in jobs with their last-run state. |
| More | Install help, notifications, invite a teammate, the rest of the portal, the automatic-sending kill switch. |

## How it reaches the bot

The bot runs on the office Mac, which nothing on the internet can call. So the
Mac calls out. Supabase is the mailbox between the two:

```
phone ── portal session ──> /api/bot/{home,messages,actions,uploads,files,push}
                                      │  bot_messages, bot_actions, bot_state
Mac   ── OPS_AGENT_TOKEN ──> /api/bot/sync            (Saddlewood-KB bot/app_bridge.py)
```

- A person writes a request or a tap. It waits in `bot_messages` / `bot_actions`.
- The Mac's bridge collects it (fast lane every 20 seconds, every 3 while
  someone is tapping), does it with the same code a texted command runs, and
  posts back the result plus a snapshot of what the bot is holding (`bot_state`).
- Neither credential works at the other door: the agent token cannot approve
  anything in a person's name, and a signed-in browser cannot write the bot's
  replies or its snapshot (`src/lib/bot/auth.ts`, tested in
  `src/app/api/bot/__tests__/routes.test.ts`).

## Who can do what

Three checks, in this order:

1. **Portal allowlist** (`src/lib/ops/allowlist.ts`, or `INTERNAL_ALLOWED_EMAILS`
   on Vercel) and a Supabase Auth user for the address. Without both there is no
   sign-in.
2. **A seat on the Mac**: `bot/app_allow.json` in Saddlewood-KB (not in git).
   `owner` sees everything and may tap; `requester` (a new employee) can ask the
   agent for things and sees only their own drafts, to-dos and requests. An
   allowlisted address with no seat sees an "ask Lando" screen.
3. **The bot's own rules**, unchanged: `approvals.may_approve`, `bot/hold.json`,
   the wire/bank hold. An approval from the app runs `approvals.handle_text`,
   the path a texted "approve 4" takes. Automatic sending can be switched off
   from the app and never on.

Things that are true on purpose:

- **A tap is for now.** The site refuses a tap once the Mac has missed three
  check-ins (nothing is queued), and the Mac refuses any tap or typed command
  older than five minutes. An approval can never fire hours later when a
  sleeping Mac wakes up. Requests in Ask do wait, up to three days.
- **A draft goes out once.** `approvals.py` takes a lock around every send and
  cancel and keeps the last word on each draft in `bot/sent_drafts.json`, so a
  second approval (from the app, a text, or the timer) is answered "already
  went out". This also covers texting.
- **Held drafts stay at the office.** A draft on the hold list (settlement,
  legal, wire details) shows in the app with its subject and no text, and
  cannot be approved from a phone.
- **A sign-in link goes to its owner's mailbox only.** `/api/ops/invite` hands
  the link back to the agent token (the CLI prints it). A signed-in person
  never sees one: it is emailed to the address it belongs to, and only an
  owner can send one to someone else.
- **The app stays out of analytics.** Its screens carry `ph-no-capture`, so
  PostHog records neither what is on them nor the text of what is tapped.

One limit to know before adding an employee: `requester` restricts the BOT.
The portal itself still has one gate, the allowlist, so anyone on it can open
every `/internal` page (estimates, contracts, expenses, trackers). The app
hides those links from a requester, and nothing more. Giving an employee the
app without the rest of the portal needs a role check on `/internal` and its
APIs, which does not exist yet.

## Putting it live

1. **Database**: `supabase/migrations/0010_bot_app.sql` (four tables, RLS with no
   policies, and the private `bot-files` bucket). Applied to the Saddlewood
   Portal project on 2026-10-03.
2. **Deploy** the site. Nothing new is required in Vercel: it uses the existing
   Supabase keys and `OPS_AGENT_TOKEN`.
3. **Notifications (optional)**: `npx web-push generate-vapid-keys`, then set
   `BOT_PUSH_PUBLIC_KEY`, `BOT_PUSH_PRIVATE_KEY` and `BOT_PUSH_SUBJECT`
   (`mailto:info@saddlewoodcontracting.com`) in Vercel and redeploy. Without
   them the app has no notification switch and everything else works.
4. **On the Mac** (Saddlewood-KB):

   ```bash
   cp bot/app_allow.example.json bot/app_allow.json   # then edit: who has a seat
   python3 bot/app_bridge.py --selftest
   python3 bot/app_bridge.py --status                 # what it would report; talks to nobody
   cp bot/launchd/com.saddlewood.bot-app.plist bot/launchd/com.saddlewood.bot-app-agent.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.saddlewood.bot-app.plist
   launchctl load ~/Library/LaunchAgents/com.saddlewood.bot-app-agent.plist
   ```

   The bridge reads `OPS_AGENT_TOKEN` from `bot/.env.ops`, the file
   `ops_board.py` already uses. Its log is `logs/bot-app.log`. That token is
   the key to everything here (it can also mint a sign-in link for anyone on
   the allowlist), so it lives in three places only: that file, Vercel, and
   the KB repo's GitHub Actions secret.
5. **Each person**: open the link on the phone, sign in, add it to the home
   screen (iPhone: Share, then Add to Home Screen; Android: Install). The first
   time it opens from the home screen it asks for a code once more, because the
   installed app keeps its own sign-in.

To take it down: `launchctl unload` the two jobs. The app then says the bot is
offline and refuses taps; texting and email to the bot are unaffected.

## Endpoints

People (portal session only):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/bot/home` | The snapshot, filtered to what this person may see; in-flight requests; recent taps |
| GET, POST | `/api/bot/messages` | The person's own thread. POST `{body, attachments?}` |
| POST | `/api/bot/actions` | `{kind, payload}`; kinds in `src/lib/bot/types.ts` (`actionSchema`). Owners only |
| POST | `/api/bot/uploads` | One-time upload URL into the person's folder of `bot-files` |
| GET | `/api/bot/files?path=` | 302 to a two-minute signed URL; own files, or any for an owner |
| POST, DELETE | `/api/bot/push` | Turn notifications on or off for this browser |

The Mac (agent token only):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/bot/sync?lane=fast\|agent` | Claims queued work; also the heartbeat |
| POST | `/api/bot/sync` | Results, replies, snapshot sections, notifications. Safe to send twice; a malformed item is dropped and counted, not refused |
| POST | `/api/bot/sync/upload` | One-time upload URL for a file the bot sends back |

## Not verified yet

Built and exercised end to end in a desktop browser at phone size against the
real database, with a stand-in bot folder (no real email was sent). Still to do
on real phones: install from the home screen on an iPhone and an Android phone,
the keyboard behavior of the Ask screen in the installed iPhone app, and a
notification arriving on each.
