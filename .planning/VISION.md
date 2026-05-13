---
name: Saddlewood Estimate Portal — Full Product Vision
description: Complete user journey, feature list, notification system, mobile-first design decisions, e-signature plan, and updated 9-phase build sequence. Supersedes the UX/feature sections of project_portal_plan.md.
type: project
originSessionId: 271de9ef-5bd1-4b51-809e-80b684f6ab3a
---
# Saddlewood Estimate Portal — Full Product Vision
**Captured: 2026-05-13 | Status: LOCKED — use this in all future build sessions**

---

## USER DEVICES & PRIORITIES (confirmed)

| Person | Primary Device | Design Priority |
|---|---|---|
| Marco (owner/approver) | iPhone — **phone first, rarely uses laptop** | Mobile-first. Everything must work one-handed. |
| Estimator (you) | Desktop | Rich editing, full pipeline control |
| Client / GC / Requestor | Unknown — assume phone 60% of the time | Mobile-optimized, no login required, no friction |

**Critical implication:** The estimate review UI is not "responsive" — it is designed mobile-first with a separate desktop layout. Marco should never feel like he's on a shrunken desktop app.

---

## COMPLETE 8-STAGE USER JOURNEY

### Stage 1 — Pipeline completes on estimator's Mac
- Pipeline auto-POSTs to `/api/estimates/ingest` after Verification Protocol passes
- Portal stores estimate in Supabase
- Triggers Stage 2 notification immediately

### Stage 2 — Marco gets notified (his phone)
- Resend email from `info@saddlewoodcontracting.com` to `marco@saddlewoodcontracting.com`
- Template: `estimate-ready`
- Email content: project name, grand total (large), flag count, big "REVIEW NOW" button
- Marco taps button → opens portal in Safari → already logged in (30-day session)

### Stage 3 — Marco reviews on phone (two speeds)
**Quick path (no flags):** Summary card → Grand Total prominently → "Approve & Send" button in thumb zone → done in 10 seconds.
**Detailed path (flags present):** System walks Marco through flagged items first (guided review). After flags resolved, Approve button appears.
Trade sections: vertical cards with section total + confidence indicator. Tap to expand. Line items shown as cards, not a table.
Editing: bottom sheet slides up with numeric keypad pre-focused when Marco taps any value. Types new number, taps Done.

### Stage 4 — Marco's decision
- **Approve:** One tap. Estimator gets email notification. Estimate status → "Approved."
- **Approve with Notes:** Marco types a note. Estimator sees it in portal.
- **Request Changes:** Marco taps flagged items, leaves per-item notes. Estimator gets email listing all change requests. Estimator fixes, resubmits. Marco gets new notification.
- **Reject (don't bid):** Status → "Rejected." Bid log updated. Marco enters a reason.

### Stage 5 — Estimator composes & sends to client (desktop)
- Compose panel: TO (pre-filled), CC (marco auto-added), BCC (info auto-added), subject (editable), personal message, format selector (5 options), send now or schedule
- Preview shows exactly what client will receive before sending
- Send → 3 simultaneous actions: client email goes out, share link created, Marco confirmation sent

### Stage 6 — Client receives email
- From: `info@saddlewoodcontracting.com`
- Content: Saddlewood logo + branding, project name, grand total, personal message, "VIEW YOUR ESTIMATE" (teal button), "ACCEPT THIS ESTIMATE" (gold button), expiry date, Marco's phone number
- Both buttons tracked. Marco notified when client opens (max 1 notification per day)

### Stage 7 — Client portal experience
- URL: `saddlewoodcontracting.com/share/[token]` — no login, no account, works on any device
- Shows estimate in chosen format (trade cards, scope narrative, assumptions, exclusions)
- Sticky "Accept" button at bottom of screen — always visible as client scrolls
- Download PDF button
- "Ask a Question" button (opens email to info@)
- Expiry countdown visible

### Stage 8 — Client accepts
- Client taps Accept → acceptance panel slides up
- Client types full name + confirms email + checks consent checkbox
- System: records timestamp + IP + user-agent + typed name
- Email verification loop: confirmation email sent to client, client clicks link to finalize (makes the audit trail stronger)
- After verification: acceptance record stored, confirmation email with PDF sent to client
- Marco gets immediate notification: "🎉 Bellevue Church accepted — $847,500"
- Estimator gets same notification
- Bid log → "Accepted"
- Marco one-tap updates to "Won" after contract signed

---

## FOLLOW-UP AUTOMATION (Vercel Cron + Resend)

Daily cron at 8:00 AM Arizona time (America/Phoenix). Checks all active estimates:

| Condition | Action |
|---|---|
| Sent 3 days ago + client hasn't opened | Send `client-reminder-3d` |
| Sent 7 days ago + opened but not accepted | Send `client-followup-7d` |
| Expires in 5 days + not accepted | Send `client-expiring-soon` |
| Expired today + no decision | Send `estimate-expired-internal` to Marco |
| Approved by Marco 30+ days ago + never sent to client | Send internal reminder to estimator |

All automated emails respect a per-estimate "No auto-follow-up" toggle Marco can set.
Each template sent max once (cron checks `email_log` before sending).

---

## ALL 12 EMAIL TEMPLATES (Resend + @react-email/components)

All built with `@react-email/components`. Consistent Saddlewood branding: teal (#2d4a4a) header, gold (#c8a55a) accents, Inter body font, mobile-optimized.

| # | Template ID | To | Trigger |
|---|---|---|---|
| 1 | `estimate-ready` | Marco | Pipeline ingest completes |
| 2 | `estimate-approved-internal` | Estimator | Marco approves |
| 3 | `estimate-changes-requested` | Estimator | Marco requests changes (includes his notes) |
| 4 | `estimate-sent-confirmation` | Marco | Estimate sent to client |
| 5 | `estimate-viewed-by-client` | Marco + Estimator | Client opens share link (max 1/day) |
| 6 | `estimate-accepted` | Marco + Estimator | Client submits acceptance |
| 7 | `estimate-expired-internal` | Marco | Bid validity expires without decision |
| 8 | `client-delivery` | Client | Estimator sends estimate |
| 9 | `client-accepted-confirmation` | Client | Client accepts (includes PDF copy) |
| 10 | `client-reminder-3d` | Client | Not opened in 3 days (cron) |
| 11 | `client-followup-7d` | Client | Opened not accepted in 7 days (cron) |
| 12 | `client-expiring-soon` | Client | 5 days before expiry, not accepted (cron) |

New npm package needed: `@react-email/components`
Add to `.env.local`: `RESEND_API_KEY` already set. Confirm `RESEND_FROM_ADDRESS=info@saddlewoodcontracting.com`

---

## MOBILE-FIRST DESIGN RULES (non-negotiable)

1. **Thumb zone is law.** Primary action button (Approve, Accept, Send) always at bottom center. Never in the top-right header.
2. **Two speeds on every estimate.** Quick path (summary card + one-tap approve) and detailed path (accordion sections) always both available. System recommends quick path when no flags.
3. **No horizontal scroll. Ever.** Tables become cards on mobile. Period.
4. **Bottom sheets for editing.** Tapping any editable value opens a bottom sheet with numeric keypad pre-focused.
5. **Session persistence.** Marco stays logged in for 30 days. No magic link every visit.
6. **Bottom tab bar.** 4 tabs: Pending (badge) | All Estimates | Bid Log | Activity. No hamburger as primary nav.
7. **One primary action per screen.** One large button, styled as primary. All other actions smaller and above it.
8. **Flag proximity.** Warning indicators (⚠️ dot) appear on the specific section card, not in a separate panel.
9. **Guided review for flagged estimates.** System walks Marco through each flag before showing Approve button. Prevents rubber-stamping.
10. **Swipe gestures.** Swipe-left on estimate card in the list → quick action buttons (Approve, Request Changes). Swipe-right → mark as reviewed.

---

## COMPLETE FEATURE LIST

### Marco's Mobile Features
- Bottom tab bar: Pending (badge count) | All Estimates | Bid Log | Activity
- Quick Approve card (summary → approve in one tap when no flags)
- Guided flag review (walk through each flagged item before approving)
- Trade section accordion cards (vertical, no horizontal scroll)
- Bottom sheet editor for dollar values (numeric keypad, comma-formatted)
- Stepper input for quantities (±1 buttons, 44px tap targets)
- Swipe-left gesture on estimate list cards
- Per-estimate comment thread (Marco ↔ estimator)
- Activity timeline per estimate (all events with timestamps)
- "Mark Won" / "Mark Lost" after client decision (one tap)
- 30-day session persistence
- Batch approval queue (multiple pending estimates, approve in sequence)
- Per-estimate follow-up toggle ("Don't send reminders for this one")

### Estimator Desktop Features
- Full two-panel layout (left: controls + totals + flags; right: trade accordion)
- Dense table view with inline editing for all line items
- AI baseline diff view (yellow highlight on changed cells, original value on hover)
- Per-trade labor rate override drawer
- All 5 format options with thumbnail preview and "when to use" description
- Compose panel (recipients, personal message, scheduling, preview)
- Multiple recipients support (+ Add recipient button)
- View client activity inline ("Opened 3 times, last at 2:14 PM yesterday")
- Re-send with different format or updated message
- Duplicate estimate for similar jobs
- Version history with restore
- Activity log per estimate
- Bulk operations on dashboard

### Client Portal Features
- Zero login, zero account creation — works on any browser, any device
- Fully mobile-optimized (designed for iPhone first)
- Grand total prominently displayed at top
- Estimate in chosen format (trade cards, scope narrative, etc.)
- Sticky "Accept" button always visible as client scrolls
- Expandable trade sections
- Scope, assumptions, and exclusions clearly separated
- Download PDF button
- "Ask a Question" button (opens email to info@saddlewoodcontracting.com)
- Expiry countdown ("X days remaining · Valid until [date]")
- View count tracked and shown to Marco/estimator in portal
- Post-acceptance: confirmation page + PDF download + next steps

### Bid Tracking & Analytics
- Per-estimate status lifecycle: Draft → In Review → Approved → Sent → Accepted/Declined/Expired → Won/Lost
- Activity timeline (every event: created, reviewed, edited, sent, opened, accepted, etc.)
- Win/loss tracking with one-tap status update
- Loss reason capture: Price / Timeline / Scope / Went with existing contractor / No decision / Cancelled / Other
- Optional: competitor price, notes
- Dashboard aggregate metrics: win rate, average bid, revenue pipeline, avg days to decision
- Estimate archive (searchable by name, client, date, amount, status)
- "Copy for Joist" formatted output (trade totals ready to paste)

---

## E-SIGNATURE PLAN

### Phase 1 — Typed Name / Click-to-Accept (Built In-House, $0)

**Legal basis:** ARS §44-7007 (Arizona UETA adoption) + Federal ESIGN Act. Legally valid for all residential and commercial contractor work in Arizona. This is the same approach Jobber uses.

**Implementation:**
1. Client taps "Accept This Estimate"
2. Bottom sheet: type full name + confirm email + check consent checkbox
3. System stores: typed name, email, timestamp, IP, user-agent, session token
4. Verification email sent to client's email address with a "Confirm Acceptance" link
5. Client clicks confirmation link → acceptance finalized
6. Confirmation email with estimate PDF sent to client
7. Acceptance record stored with full audit trail in `acceptance_records` table

**What makes it defensible:** The email verification loop (client must click a link sent to their email before acceptance is finalized) proves the person who clicked owns that email address. Combined with timestamp + IP, this creates a solid audit trail.

### Phase 2 — Dropbox Sign API ($75/month)

**Trigger for upgrade:** Estimates over $500K, or when a commercial client or GC specifically requests a formally signed proposal (common on larger commercial GC work).

**Why Dropbox Sign over DocuSign:**
- 75% cheaper at 30 proposals/month ($900/year vs. $3,600/year)
- Best mobile client signing UX (94% completion rate vs DocuSign's 87%)
- Clients don't need an account
- "Responsive Signer Experience" mode optimized for iPhone browsers

**Implementation:** Per-estimate toggle: "Use e-signature for this proposal." When enabled, routes acceptance through Dropbox Sign API instead of built-in typed name flow.

---

## NEW DATABASE TABLES (additions to original schema)

### `acceptance_records`
Stores the typed-name acceptance audit trail:
```
id, estimate_id, export_link_id,
acceptor_name (typed), acceptor_email,
timestamp, ip_address, user_agent,
verification_token, verification_confirmed_at,
pdf_snapshot_path (storage path of the estimate at time of acceptance)
```

### `estimate_comments`
Internal thread between Marco and estimator per estimate:
```
id, estimate_id, author_email, body, 
is_change_request (bool), resolved (bool),
created_at
```

### `estimate_activity`
Full event log per estimate:
```
id, estimate_id, event_type, actor_email, 
metadata (JSONB — e.g., { "field": "overhead_pct", "from": 15, "to": 18 }),
ip_address, user_agent, created_at
```

Event types: created | reviewed | approved | changes_requested | rejected | sent_to_client | client_opened | client_accepted | client_declined | expired | reopened | status_updated

---

## UPDATED PHASE PLAN (9 phases)

| Phase | Focus | Key Deliverables |
|---|---|---|
| 1 | Foundation | Route groups, Supabase setup, auth, middleware, login page |
| 2 | Data pipeline | Ingest API, pipeline JSON export, test end-to-end push |
| 3 | Mobile Marco review | Dashboard (mobile cards), quick approve card, trade accordion, bottom tab bar |
| 4 | Editing | Bottom sheet editor, per-trade labor rates, autosave, comments thread |
| 5 | Client communications | 12 email templates, compose panel, multiple recipients, scheduling |
| 6 | Client acceptance | Client portal page, sticky accept button, typed name flow, email verification, audit record |
| 7 | Follow-up automation | Vercel Cron job, 3 reminder templates, per-estimate toggle |
| 8 | Bid log & analytics | Activity timeline, win/loss tracking, loss reasons, dashboard metrics, archive |
| 9 | E-signature upgrade | Dropbox Sign API, per-estimate toggle, triggered by $500K+ or client request |

---

## ADDITIONAL NPM PACKAGES (additions to previous list)

```bash
npm install @react-email/components   # email templates
npm install react-email               # email rendering dev server (dev only)
```

## NEW ENV VARS

```bash
# Already confirmed set:
RESEND_API_KEY=<already configured>
RESEND_FROM_ADDRESS=info@saddlewoodcontracting.com

# Marco's notification email:
MARCO_EMAIL=marco@saddlewoodcontracting.com

# For Vercel Cron authentication (cron job calls /api/cron/follow-ups):
CRON_SECRET=<generate with openssl rand -hex 32>

# Phase 9 only (Dropbox Sign):
DROPBOX_SIGN_API_KEY=<from Dropbox Sign dashboard>
```

---

## NOTES FOR FUTURE SESSIONS

- **Marco is phone-first.** Do not build the review UI as a desktop app with responsive breakpoints. Build it for iPhone first, then adapt for desktop.
- **Session persistence.** Make sure Supabase session cookie lasts 30 days. Marco should not have to re-authenticate more than once a month.
- **Email templates are a meaningful surface.** These are what Marco and clients see. Spend real time on them — they represent Saddlewood's brand.
- **Client portal is also a brand touchpoint.** It's the first web experience a client has with Saddlewood. It needs to feel as professional as the estimates themselves.
- **Typed name acceptance before Dropbox Sign.** Don't skip Phase 6 and jump to Phase 9 — the built-in flow is simpler and legally sufficient for the majority of work.
- **Vercel Cron** is available on Vercel Pro (which is confirmed). Cron syntax in `vercel.json`, fires server-side API route.
- **Read both memory files** at start of every build session: `project_portal_plan.md` (architecture + schema + env vars) AND this file (vision + UX + features + emails).
