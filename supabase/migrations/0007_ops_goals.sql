-- Goals and dates the company is working toward, shown as a calendar under
-- /internal/ops/calendar. Four kinds: goal (an outcome by a date), milestone
-- (a step in the 30-day plan), deadline (money or compliance, immovable),
-- recurring (the weekly rhythm; recur_weekday 0=Sun..6=Sat, or recur_monthday).
-- Service-role only, like the board.

create table if not exists public.ops_goals (
  id             text primary key,
  title          text not null,
  kind           text not null default 'goal',
  owner          text not null default 'Lando',
  due_date       date,
  recur_weekday  smallint,
  recur_monthday smallint,
  horizon        text,
  status         text not null default 'open',
  notes          text not null default '',
  card_id        text references public.ops_cards(id) on delete set null,
  doc_slug       text,
  done_at        timestamptz,
  updated_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ops_goals_kind_check check (kind in ('goal', 'milestone', 'deadline', 'recurring')),
  constraint ops_goals_owner_check check (owner in ('Marco', 'Lando', 'Ilene', 'Eli', 'Team')),
  constraint ops_goals_status_check check (status in ('open', 'done')),
  constraint ops_goals_id_check check (id ~ '^[a-z0-9][a-z0-9-]*$' and length(id) <= 64),
  constraint ops_goals_recur_check check (
    (recur_weekday is null or (recur_weekday between 0 and 6)) and
    (recur_monthday is null or (recur_monthday between 1 and 31))
  )
);

drop trigger if exists trg_ops_goals_updated_at on public.ops_goals;
create trigger trg_ops_goals_updated_at
  before update on public.ops_goals
  for each row execute function public.set_updated_at();

create index if not exists ops_goals_due_idx on public.ops_goals (due_date) where status = 'open';
alter table public.ops_goals enable row level security;
comment on table public.ops_goals is 'Goals, milestones, deadlines, and the weekly rhythm shown on the Ops calendar. Service-role access only.';

insert into public.ops_goals (id, title, kind, owner, due_date, recur_weekday, recur_monthday, horizon, status, notes, card_id, doc_slug, updated_by) values
  -- the weekly rhythm (operating model §4)
  ('rhythm-daily-log',      'Daily log filed by 5 pm; end-of-day check-in to Marco with rule? tags', 'recurring', 'Eli',   null, null, null, 'rhythm', 'open', 'Every working day. SOP-006 Appendix C; the decision log comes from the tags.', 'daily-log', 'sop-006', 'seed-2026-09-04'),
  ('rhythm-mon-report',     'Weekly report with the operations grade',        'recurring', 'Team',  null, 1, null, 'rhythm', 'open', 'Generated from the KB. Read it, do not file it.', 'scorecard-query', 'operating-model', 'seed-2026-09-04'),
  ('rhythm-tue-ar',         'AR call: run the ladder on every open invoice',  'recurring', 'Ilene', null, 2, null, 'rhythm', 'open', 'SOP-007 §5. Day +1, +7 by Ilene; +14 and later by Marco.', 'ar-ladder', 'sop-007', 'seed-2026-09-04'),
  ('rhythm-wed-lookahead',  'Two-week look-ahead to each GC',                 'recurring', 'Eli',   null, 3, null, 'rhythm', 'open', 'SOP-006 Appendix E.', null, 'sop-006', 'seed-2026-09-04'),
  ('rhythm-fri-schedule',   'Every active job schedule current; hours vs earned by phase', 'recurring', 'Eli', null, 5, null, 'rhythm', 'open', 'SOP-006 gate 2, Friday.', null, 'sop-006', 'seed-2026-09-04'),
  ('rhythm-fri-review',     'Ops Board review, 30 minutes, Lando plus Marco', 'recurring', 'Team',  null, 5, null, 'rhythm', 'open', 'Which escalations become rules; which cards move. Starts week 4.', 'ops-review', 'operating-model', 'seed-2026-09-04'),
  ('rhythm-aft-cutoff',     'AFT billing cutoff: invoices in with waivers',    'recurring', 'Ilene', null, null, 23, 'rhythm', 'open', 'AFT closes the 23rd. Percent complete from the PM three business days before.', 'billing-calendar', 'sop-007', 'seed-2026-09-04'),
  -- first 30 days (operating model §9)
  ('w1-charter',            'Marco signs Eli''s charter',                      'milestone', 'Marco', '2026-09-11', null, null, '30-days', 'open', 'A quiet half hour with Eli. Both sign. Then the one-line announcement to Schifferer.', 'eli-charter', 'eli-charter', 'seed-2026-09-04'),
  ('w1-bellevue-redline',   'Bellevue subcontract read against SOP-007 §3 before DocuSign', 'milestone', 'Lando', '2026-09-11', null, null, '30-days', 'open', 'One email to Marco with the ten items, then he signs.', 'bellevue-redline', 'sop-007', 'seed-2026-09-04'),
  ('w1-handoff-packet',     'Bellevue handoff packet filled from the signed contract', 'milestone', 'Lando', '2026-09-11', null, null, '30-days', 'open', 'Brackets closed; Eli signs the last line at the handoff meeting.', 'handoff-bellevue', 'bellevue-handoff', 'seed-2026-09-04'),
  ('w1-coi-endorsement',    'Completed-operations endorsement received from the broker', 'deadline', 'Ilene', '2026-09-11', null, null, '30-days', 'open', 'The last open item on the Schifferer package (Debra Romero, CSLS).', null, 'bellevue-handoff', 'seed-2026-09-04'),
  ('w1-board-live',         'Ops board live for Marco and Ilene',              'milestone', 'Lando', '2026-09-04', null, null, '30-days', 'done', 'Portal, sign-in links, and the board shipped 9/4.', 'ops-review', 'operating-model', 'seed-2026-09-04'),
  ('w2-precon',             'Pre-con with Paul Johnson; names of who can direct work recorded', 'milestone', 'Eli', '2026-09-18', null, null, '30-days', 'open', 'SOP-006 gate 1.', null, 'sop-006', 'seed-2026-09-04'),
  ('w2-daily-log',          'Daily log in use from the first day on site',     'milestone', 'Eli',   '2026-09-18', null, null, '30-days', 'open', 'Appendix C, by email to info@, photos attached.', 'daily-log', 'sop-006', 'seed-2026-09-04'),
  ('w2-co-intake',          'CO-intake script and confirming email on Eli''s phone', 'milestone', 'Lando', '2026-09-18', null, null, '30-days', 'open', 'Appendix D.', 'co-intake', 'sop-006', 'seed-2026-09-04'),
  ('w2-billing-calendar',   'Billing-calendar tasks for Bellevue and the AFT jobs', 'milestone', 'Ilene', '2026-09-18', null, null, '30-days', 'open', 'Cutoffs, waiver forms, invoice contacts in tasks.py.', 'billing-calendar', 'sop-007', 'seed-2026-09-04'),
  ('w3-scorecard',          'First scorecard section in the weekly report',    'milestone', 'Lando', '2026-09-25', null, null, '30-days', 'open', 'Whatever data exists, gaps shown.', 'scorecard-query', 'operating-model', 'seed-2026-09-04'),
  ('w3-ar-ladder',          'AR ladder running on the $1.12M live list',        'milestone', 'Ilene', '2026-09-25', null, null, '30-days', 'open', 'Bot drafts, Ilene sends through day +7.', 'ar-ladder', 'sop-007', 'seed-2026-09-04'),
  ('w3-agreement-counsel',  'Residential agreement template to flat-fee counsel', 'milestone', 'Marco', '2026-09-25', null, null, '30-days', 'open', 'SOP-007 §1 with Marco''s values filled.', 'residential-contract', 'sop-007', 'seed-2026-09-04'),
  ('w4-first-review',       'First Ops Board review with a baseline: Marco decisions per week', 'milestone', 'Team', '2026-10-02', null, null, '30-days', 'open', 'Split rule-answerable vs genuine. First SOP retro the same day.', 'ops-review', 'operating-model', 'seed-2026-09-04'),
  -- money and compliance deadlines
  ('settle-1',              'Settlement payment 1 of 3 to Jon Wright, $12,500', 'deadline', 'Ilene', '2026-09-18', null, null, 'deadlines', 'open', 'Per the signed agreement of 8/28; written payment instructions per §1.5 first.', null, null, 'seed-2026-09-04'),
  ('settle-2',              'Settlement payment 2 of 3 to Jon Wright, $12,500', 'deadline', 'Ilene', '2026-10-09', null, null, 'deadlines', 'open', 'Three weeks after payment 1.', null, null, 'seed-2026-09-04'),
  ('settle-3',              'Settlement payment 3 of 3 to Jon Wright, $10,000', 'deadline', 'Ilene', '2026-10-30', null, null, 'deadlines', 'open', 'Final payment; the guaranty and stipulated judgment terminate at payment in full.', null, null, 'seed-2026-09-04'),
  ('cmp-renewal',           'Renew MCAQD dust registration CMP029338',          'deadline', 'Ilene', '2027-08-26', null, null, 'deadlines', 'open', 'MCAQD sends no second warning. Same $50, same form.', 'safety-program', 'bellevue-handoff', 'seed-2026-09-04'),
  -- quarter and year goals (operating model §1, §2, §6)
  ('q4-exit-list',          'Marco off the exit list: no dispatch, sub coordination, receipt chasing, invoice mechanics, scheduling', 'goal', 'Marco', '2026-10-31', null, null, 'quarter', 'open', 'Operating model §2. Eli owns the field; Ilene owns billing mechanics.', 'eli-charter', 'operating-model', 'seed-2026-09-04'),
  ('q4-grade-c',            'Operations grade from F to C',                    'goal', 'Team',  '2026-12-31', null, null, 'quarter', 'open', 'Paper-vendor receipts, lead source, and pipeline dollars are the three zero lines.', 'ghl-hygiene', 'operating-model', 'seed-2026-09-04'),
  ('q4-decisions-down',     'Marco decisions per week down 25% from the week-4 baseline', 'goal', 'Team', '2026-12-31', null, null, 'quarter', 'open', 'The single number that says the company is becoming sellable.', 'decision-log', 'sop-006', 'seed-2026-09-04'),
  ('q4-three-quotes',       'Three quotes on every sub package of $5,000 or more', 'goal', 'Lando', '2026-12-31', null, null, 'quarter', 'open', 'SOP-008 §2, measured weekly.', 'bid-out-pipeline', 'sop-008', 'seed-2026-09-04'),
  ('q4-bellevue-scored',    'Bellevue is the first fully scored job',          'goal', 'Eli',   '2026-12-31', null, null, 'quarter', 'open', 'Every scorecard line filled at the retro, gaps named.', 'scorecard-query', 'operating-model', 'seed-2026-09-04'),
  ('2027-hires',            'Estimating admin and bookkeeper in seat',          'goal', 'Marco', '2027-03-31', null, null, '2027', 'open', 'ROLE-GAP-ANALYSIS: the two roles the data already argues for.', 'hire-estimating-admin', 'sop-005', 'seed-2026-09-04'),
  ('2027-buildero-dogfood', 'Saddlewood runs receipts, COs, and the board on Buildero', 'goal', 'Lando', '2027-06-30', null, null, '2027', 'open', 'Build order items 1 to 9 in the platform map.', 'buildero-lifecycle', 'buildero-map', 'seed-2026-09-04'),
  ('2027-grade-b',          'Operations grade B, every active job with a billing calendar and a scorecard', 'goal', 'Team', '2027-12-31', null, null, '2027', 'open', '', null, 'operating-model', 'seed-2026-09-04'),
  ('exit-20m',              'Revenue run-rate $20M',                            'goal', 'Marco', '2029-12-31', null, null, 'exit', 'open', 'The roadmap number. Only defensible once the capture layer holds.', null, 'operating-model', 'seed-2026-09-04'),
  ('exit-sale',             'Saddlewood sells for eight or nine figures',       'goal', 'Marco', '2031-12-31', null, null, 'exit', 'open', 'Three to seven years from September 2026. Worth what the company is worth without Marco in the truck.', null, 'operating-model', 'seed-2026-09-04')
on conflict (id) do nothing;
