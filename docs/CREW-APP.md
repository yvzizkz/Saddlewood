# The crew side of the Saddlewood app

Field workers and employees open the same link as everyone else
(`https://saddlewoodcontracting.com/app`) and get a different app: their own
day, not the bot's. The owners' side of it is the **Crew** tab in the app they
already have. See `docs/BOT-APP.md` for that app and how it reaches the bot.

For the crew, the bot stays in the background. They never talk to it. It works
from what they log, and asks them when something is missing.

## What a crew member has

| Tab | What it is for |
|---|---|
| Today | Clock in, clock out, change job. Today's and tomorrow's job with a Directions button. What the office is asking. Four buttons: Receipt, Progress, End of day, Note. Their tasks. What they sent today and what became of it. |
| Week | The next seven days of their schedule, and everything assigned to them. |
| Hours | This week and last, shift by shift, with the total. "Something wrong with your hours?" sends a time fix to the office. |
| More | English or Español, putting the app on the home screen, notifications, sign out. |

Every screen is in English and Spanish (`src/components/crew/strings.ts`). The
end-of-day form follows the daily log and the crew card in SOP-006: what got
done, what is stuck, what is needed for tomorrow, and five yes/no questions
(work asked for that is not on the plans, deliveries, inspections and
visitors, safety, a decision for Marco).

## What an owner has (the Crew tab)

| View | What it is for |
|---|---|
| Today | Needs you (time fixes, shifts worth a look, someone who cannot make it, someone stuck on a task). Who is on the clock. Who is scheduled and has not clocked in. Everything that came in from the field, with photos. Tasks out. Questions out and their answers. |
| Schedule | Who is where, day by day, for the next week. "Same as yesterday" copies a day. A change for today or tomorrow buzzes the person's phone at once. |
| Hours | The week's timesheet per person, every shift with how it was recorded, corrections, and "Download this week for payroll" (CSV). |
| Team | Who has a seat (add, change language, take the seat away, email the link, get a code), and the list of jobs. |

Home also shows one line ("Crew: 3 on the clock") and the Crew tab carries a
badge when something waits on an owner.

## Who can do what

- **Crew** are a row in `crew_people` AND `app_metadata.sw_role = "crew"` on
  their Supabase Auth user. Both are set when an owner adds them (Team, "Add a
  person"). Taking the seat away marks the Auth user `former` and bans it:
  the app closes for them on their next tap and their session cannot be
  renewed. A person cannot set `app_metadata` on themselves.
- **The mark is never cleared, only changed.** A crew sign-in is a real
  Supabase session, and the estimate tables (`jobs`, `estimates`, ...) were
  written to trust any signed-in session. Migration 0011 puts a restrictive
  rule on them: a session whose Auth user carries any `sw_role` gets nothing.
  Staff carry no mark. So an Auth user is either staff or marked, for good.
  If you ever create an Auth user by hand for someone who is not staff, give
  it a mark, or it reads the estimates.
- Crew are **never on the portal allowlist**. `src/proxy.ts` gives them
  `/app` and `/api/crew/*` and sends them back to the app from anything else;
  every `/internal` page and every other API answers them the way it answers
  a stranger. This is the role gate the earlier `requester` seat did not have.
- A crew member can only ever write as themselves: their own punch, their own
  entries with photos from their own folder, their own task, their own answer.
  Nothing in what they can send names another person or sets a time
  (`crewActSchema`, tested in `src/lib/crew/__tests__`).
- **Owners** (an owner's seat in `bot/app_allow.json`, as before) manage
  everything through `/api/crew/admin`. Staff on the allowlist without an
  owner's seat, crew, and the agent token are all refused there.
- **The Mac** reads and writes through `/api/bot/crew` with `OPS_AGENT_TOKEN`.

## Things that are true on purpose

- **The site is the record, not the Mac.** A clock-in at 6 AM is written to
  Supabase at once with the server's time. Nothing a person does on a jobsite
  waits for the office Mac. The Mac reads it afterwards.
- **A punch with no signal is kept, and marked.** If the tap cannot be sent,
  the phone keeps it with the time of the tap and sends it when it is back
  online (up to 18 hours later). The shift then says "sent 14 min after the
  tap", so an owner can see which times came from the server's clock and
  which from a phone's. Everything else (receipts, notes) needs signal: the
  form stays open and says so.
- **Nobody changes their own time.** A crew member sends a time fix; an owner
  approves it or not. Every change to a shift keeps what it said before, who
  changed it and why. A clock-out given afterwards ("I left at 3:30", in
  answer to the bot) closes the shift flagged for an owner to look at.
- **Location is taken once, at the tap,** if the person allows it. Never while
  they work. A punch with no location still counts.
- **One open shift per person,** held by a unique index, so two taps racing
  cannot open two.
- **A saved punch belongs to the person who tapped it.** The phone keeps it
  under their address. Someone else signing in on that phone neither sees it
  nor sends it; it goes when its owner is signed in again.
- **A database hiccup is not a sign-out.** If the seat cannot be looked up the
  app says "try again" (503). Only a real "you have no seat" (401) sends
  someone to the sign-in page, and a saved punch survives both.
- **A gate code is not broadcast.** A job's site note shows only to people
  scheduled there or clocked in there.
- **A crew member's sign-in code can be handed to them by an owner** (Team,
  "Get a code"): for someone standing next to you on a jobsite. Only for a
  crew seat, never for an address on the portal allowlist. It does mean an
  owner could sign in as that crew member.
- **The sign-in page does not say who has access.** `/api/auth/send-link`
  answers a typed email the same way whether it is staff, crew, or unknown,
  and the staff allowlist is no longer shipped to the browser.
- **The old one-tap punch link is gone.** `/crew/punch` and `/api/crew/punch`
  took no sign-in: anyone could read the worker list (names, phone numbers,
  hourly rates, gate codes) and clock anyone in or out. It had never recorded
  a punch. `/crew/punch` now redirects to the app.

## What the bot does in the background (Saddlewood-KB `bot/crew.py`)

Once a minute (`com.saddlewood.bot-app-crew`):

1. Keeps a copy the rest of the bot can read: `bot/crew/state.json` and one
   log per day in `bot/crew/days/`. The agent that answers owners reads these
   when asked about hours, a job's day, or tomorrow's crew.
2. Files receipts: reads the photo (OCR), and enters the expense under the
   job the person picked, in `bot/accounting_state.json` and on the portal's
   Expenses page, the same record a texted receipt makes. The person's own
   figure wins over the photo's; a disagreement, or a receipt paid out of
   pocket, is flagged for an owner.
3. Asks what is missing, in the person's language: a clock-out someone forgot
   (after 11 hours, or at 7 PM), the total on a receipt it could not read, the
   end-of-day check-in (after 3 PM, twenty minutes after clocking out), and
   "what is going on?" when someone scheduled has not clocked in half an hour
   after the start (the owners are told as well).
4. Sends each person, from 5:30 PM, where they are tomorrow. Tells the owners
   at 6 PM if a weekday has nobody on it.
5. Writes the owners an evening brief (5:45 PM once everyone has clocked out
   and filed, 7:30 PM at the latest) into each owner's Ask thread: hours, what
   got done, what is stuck, extra work that was asked for, receipts and
   reimbursements, tomorrow's schedule, loose ends.

What a crew member types is treated as a report, never as an instruction.
Before it is written anywhere on the Mac it is flattened to one line with no
angle brackets, no backticks and no "@". The "@" matters: the `claude` CLI
attaches the contents of any file named after an "@" in its prompt even with
every tool switched off (tested 2026-10-04), so a note reading
"@/path/to/a/secret" would otherwise hand that file to the model.

That text reaches a model in one place only: the "line up for tomorrow" list
in the brief and up to three follow-up questions. The call runs with no
tools, no MCP servers, no skills and no project files; people are named to it
by a number, never an address; and this Mac's site token is not in its
environment. What it returns is checked piece by piece: anything carrying a
link, a domain, an address or a phone-length number is dropped before it can
reach a person. It is called at most twice for a day's brief; if it fails, the
brief goes out without that part. Set `MODEL_ASKS_CREW = False` in
`bot/crew.py` to keep its questions from going to the crew at all.

An expense is entered once per receipt however often a pass repeats: the
accounting file and the portal both key it to the app entry. If another
program's write drops it from the accounting file, the next pass puts it
back.

## Putting it live

1. **Database**: `supabase/migrations/0011_crew.sql`. One transaction. It first
   puts two locks on what is already there (the restrictive rule on the
   estimate tables, and `ingest_estimate()` no longer callable with the public
   key: until this runs, anyone holding the site's public key can call it),
   then creates the seven crew tables (RLS, no policies, server access only).
   The site can be deployed before it: the Crew tab stays hidden and no crew
   sign-in can be created until the tables exist.
2. **Deploy** the site. Nothing new is required in Vercel.
3. **On the Mac** (Saddlewood-KB):

   ```bash
   python3 bot/crew.py --selftest
   python3 bot/crew.py --status          # what the site has; changes nothing
   cp bot/launchd/com.saddlewood.bot-app-crew.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.saddlewood.bot-app-crew.plist
   ```

4. **In the app**, Crew tab, Team: add the jobs, then each person (name, the
   email they read on their phone, language). They get the link by email.
5. **Each person**: open the link, sign in with their email and the code,
   add it to the home screen. The installed app asks for the email and a code
   once more.

To stop the background part: `launchctl unload` that job. The crew can still
clock in and send everything; receipts stop being filed, questions stop being
asked, and the brief stops, until it is loaded again.

## Endpoints

Crew (their own session):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/crew/me` | Everything their screens show |
| POST | `/api/crew/act` | `{kind, ...}`; kinds in `src/lib/crew/types.ts` (`crewActSchema`) |
| POST | `/api/crew/uploads` | One-time upload URL into their own folder of `bot-files` |
| GET | `/api/crew/files?path=` | Their own photos |
| POST, DELETE | `/api/crew/push` | Notifications for this phone |

Owners (portal session with an owner's seat):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/crew/admin?week=` | Everything the Crew tab shows |
| POST | `/api/crew/admin` | `{kind, ...}`; kinds in `adminActSchema` |
| GET | `/api/crew/admin/export?from=&to=` | The timesheet as CSV |

The Mac (agent token):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/bot/crew` | The last three days, plus whatever is not filed yet |
| POST | `/api/bot/crew` | Results, questions, flags, notifications. Safe to send twice |

## Not built yet

- A lead or foreman seat (sees their crew, sets the schedule). Today that is
  the owners.
- Telling the bot in Ask to schedule people or assign tasks. The agent can
  read the crew's record; changes are made in the Crew tab.
- Working fully offline. The app needs signal to open; only a punch is kept
  when there is none.
- Geofencing. A punch carries where the phone was; nothing checks it against
  the job's address.
- Overtime and pay. Hours here are time on the clock less the break, Monday
  to Sunday; the office figures pay.
