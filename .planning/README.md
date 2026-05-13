# Saddlewood Estimate Portal — Planning Documents

Complete build plan for the internal estimate review portal.  
Generated: 2026-05-13 | Status: PLAN LOCKED — ready for execution

---

## Quick Start on Windows

```bash
# 1. Clone and install
git clone https://github.com/yvzizkz/Saddlewood
cd Saddlewood
npm install

# 2. Install portal packages
npm install @supabase/supabase-js @supabase/ssr zustand resend exceljs docx @react-email/components

# 3. Create .env.local — see ARCHITECTURE.md for all required variables

# 4. Open in your editor and start Phase 1
```

See `ARCHITECTURE.md` for the complete env vars list and pre-execution checklist.

---

## Documents

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Database schema, API routes, env vars, packages, infrastructure |
| `VISION.md` | Full user journey, mobile-first design rules, 12 email templates, feature list |
| `phases/phase-1-foundation.md` | Route groups, Supabase auth, middleware, login page |
| `phases/phase-2-pipeline.md` | Ingest API, JSON export, pipeline→portal connection |
| `phases/phase-3-marco-mobile.md` | iPhone dashboard, quick approve, trade accordion, Zustand store |
| `phases/phase-4-editing.md` | Bottom sheets, autosave, labor rate overrides, AI diff view |
| `phases/phase-5-communications.md` | 12 email templates, compose panel, Resend integration |
| `phases/phase-6-client-acceptance.md` | Client portal page, typed-name acceptance, email verification |
| `phases/phase-7-automation.md` | Vercel Cron, follow-up emails, 5 automated check types |
| `phases/phase-8-analytics.md` | Bid log, win/loss tracking, activity timeline, dashboard metrics |
| `phases/phase-9-esignature.md` | Dropbox Sign API (optional upgrade for $500K+ proposals) |

---

## Execute Phases in Order

**Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → (9 optional)**

Each phase plan contains:
- Phase goal and success criteria checklist
- Exact `src/` file paths to create
- TypeScript interfaces, component code, hook implementations
- API route logic
- Database migration SQL
- Testing checklist and common pitfalls

**Important:** Phase 2 (connecting the AI pipeline to the portal) is done on the Mac where the pipeline runs, not on Windows. All other phases are pure portal work done here on Windows.

---

## Key Technical Decisions (locked)

| Decision | Answer |
|---|---|
| Framework | Next.js 16.1.6 App Router + TypeScript strict |
| Database + Auth | Supabase (project: rwzmcknxlucwbhsyxdcx.supabase.co) |
| Auth method | Magic link (email OTP) — Marco's email only |
| State management | Zustand (editor) + SWR (lists) |
| Email | Resend — from info@saddlewoodcontracting.com |
| Export | exceljs (Excel) + docx (Word) |
| Hosting | Vercel Pro (already active) |
| Marco's device | iPhone primary — mobile-first design throughout |
| Joist integration | Manual copy for now (no public API exists) |
| E-signature | Typed name Phase 1–8; Dropbox Sign API Phase 9 (optional) |

---

## Starting Execution in Claude Code

Open this repo in Claude Code on Windows and say:

> "Read `.planning/ARCHITECTURE.md` and `.planning/phases/phase-1-foundation.md` then execute Phase 1."

Claude Code will have everything it needs from those two files to start building.
