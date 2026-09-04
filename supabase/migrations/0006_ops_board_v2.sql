-- Ops board v2: every card carries how to act on it and which document it
-- comes from; people leave responses on a card that stay as a record; moves
-- are still audited in ops_card_events. Idempotent.

alter table public.ops_cards add column if not exists next_step text not null default '';
alter table public.ops_cards add column if not exists doc_slug  text;
alter table public.ops_cards add column if not exists due_date  date;

create table if not exists public.ops_card_comments (
  id        bigint generated always as identity primary key,
  card_id   text not null references public.ops_cards(id) on delete cascade,
  author    text not null,
  body      text not null,
  at        timestamptz not null default now()
);
create index if not exists ops_card_comments_card_at_idx on public.ops_card_comments (card_id, at desc);
alter table public.ops_card_comments enable row level security;
comment on table public.ops_card_comments is 'Responses left on an Ops card by people (allowlisted email) or agents. Service-role access only.';

-- How to act on each seeded card, and the document it lives in.
update public.ops_cards as c set next_step = v.next_step, doc_slug = v.doc_slug
from (values
  ('sop-001', 'sop-001', 'Weekly: work the receipt exception list. The open item is the photo rule for paper vendors, still 0 of 20 on the grade.'),
  ('sop-002', 'sop-002', 'Weekly query: invoices that grew without a CO. Enforce on Bellevue from the first directive.'),
  ('sop-003', 'sop-003', 'Create 9440 W Hutton Dr in the system of record before the first material run.'),
  ('sop-004', 'sop-004', 'Record each sub''s cadence at onboarding. Treat any past-due demand as a process failure and trace where the invoice skipped the pipeline.'),
  ('sop-005', 'sop-005', 'Marco approves or edits the judgment-versus-clerical split. It becomes the estimating-admin job description.'),
  ('sop-006', 'sop-006', 'Marco reads and edits. Eli reads Appendices A to D. Pilot on Bellevue from gate 0.'),
  ('sop-007', 'sop-007', 'Marco sets the §1 values. Lando runs the §3 checklist before DocuSign. Template to flat-fee counsel.'),
  ('sop-008', 'sop-008', 'Marco reads §1 and §2. First package: Bellevue insulation, the week the subcontract is signed.'),
  ('eli-charter', 'eli-charter', 'Marco edits, then a quiet half hour with Eli early next week. Both sign. Marco sends the one-line announcement to Schifferer.'),
  ('handoff-bellevue', 'bellevue-handoff', 'Fill the brackets from the DocuSign subcontract. Eli signs the last line at the handoff meeting.'),
  ('bellevue-redline', 'sop-007', 'Lando reads the subcontract against SOP-007 §2, one email to Marco, then Marco signs.'),
  ('daily-log', 'sop-006', 'Eli uses Appendix C from the first day on site. Lando builds the 5 pm nag on the info@ mailbox.'),
  ('co-intake', 'sop-006', 'Put Appendix D''s script and confirming email on Eli''s phone. The bot opens a ledger row per directive.'),
  ('quality-checklists', 'sop-006', 'Eli marks up Appendix B from the field. Print for the truck. Pre-cover gate on Bellevue framing.'),
  ('billing-calendar', 'sop-007', 'Enter each job''s cutoff and waiver form into tasks.py. AFT closes the 23rd; Schifferer comes from the subcontract.'),
  ('invoice-package', 'sop-007', 'Ilene runs §4 on the next AFT invoice: waiver attached, receipt confirmed in one day, ledger row open.'),
  ('ar-ladder', 'sop-007', 'Start §5 on the $1.12M live list on Tuesday. The bot drafts; Ilene sends through day +7; Marco from +14.'),
  ('residential-contract', 'sop-007', 'Marco fills the §1 values. Lando assembles the template. One flat-fee attorney review before first use.'),
  ('gc-redline', 'sop-007', 'Use §2 on Bellevue first. Keep the list to ten items. Add it to the handoff packet checklist.'),
  ('decision-log', 'sop-006', 'Eli tags every ask in the end-of-day text: rule? y/n. Lando counts weekly from week one.'),
  ('scorecard-query', 'operating-model', 'Lando writes the per-job SQL over hours, receipts, invoices, and COs. First section in the weekly report in week three.'),
  ('safety-program', 'bellevue-handoff', 'Collect Appendix E signatures from every employee. First toolbox talk logged on Bellevue day one.'),
  ('training-es', 'crew-guide-001', 'Write the Spanish visor cards for SOP-002 and SOP-006 Appendices C and D in the crew-guide format.'),
  ('hire-estimating-admin', 'sop-005', 'Postings are live. Screen against SOP-005. The hire owns intake, transmission, and revisions on day one.'),
  ('hire-bookkeeper', 'sop-004', 'Decide: part-time hire, or Ilene plus the AR ladder and the invoice package rule for now.'),
  ('ops-review', 'operating-model', 'Friday, 30 minutes, Lando plus Marco: which escalations become rules, which cards move. First one in week four.'),
  ('buildero-receipts', 'buildero-map', 'Buildero session: receipt upload with a required job picker. Build order item 1.'),
  ('buildero-co', 'buildero-map', 'Buildero session: the invoice refuses a CO line without a signed CO. Build order item 2.'),
  ('buildero-lifecycle', 'buildero-map', 'Buildero session: gates as phases, daily-log nag, decision log, scorecards. Build order items 6, 8, 9.'),
  ('lien-hygiene', 'sop-007', 'Ilene serves the 20-day notice on every job as routine paperwork. Counsel confirms the prime-contractor rule.'),
  ('ghl-hygiene', 'sop-005', 'Make source and dollar value required fields in GHL. These are the two zero-scoring lines on the grade.'),
  ('sub-msa', 'sop-008', 'Lando drafts from §1 A. Marco reviews. Same flat-fee counsel pass as the client agreement.'),
  ('work-order', 'sop-008', 'Two-page template with variables from §1 B. First use on Bellevue insulation.'),
  ('po-terms', 'sop-008', 'Ilene builds the PO terms sheet from §1 D. Attach to every order of $500 or more, fees stated up front.'),
  ('flow-down', 'sop-008', 'Lando generates it from the Schifferer extraction the day the subcontract is signed.'),
  ('sub-onboarding', 'sop-008', 'Ilene builds the packet checklist from §1 G. No sub starts without it.'),
  ('bid-out-pipeline', 'sop-008', 'Run §2 stages 1 to 6 on Bellevue insulation. The bot parses quotes into the leveling sheet.'),
  ('sub-scorecard', 'sop-008', 'Eli fills the §2 scorecard at each closeout. It feeds the next leveling sheet.'),
  ('buildero-platform-map', 'buildero-map', 'The Buildero session logs execution status in §5. Lando reviews it weekly.'),
  ('bonus-plan-v2', 'operating-model', 'Marco sets X and the flat boost amounts. Then it goes into Eli''s charter as an exhibit.')
) as v(id, doc_slug, next_step)
where c.id = v.id and c.next_step = '';
