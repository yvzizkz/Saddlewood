-- Billing step 3 (Saddlewood-KB docs/BILLING-ISSUE-PLAN-2026-10-12.md, "The
-- screen: Bill in the Saddlewood app"): the working message of a send group
-- lives on the site, so an owner can review and change it from a phone and a
-- reload shows what was saved.
--
--   send_groups.message   {subject, body, to, cc, intro, updatedAt, updatedBy,
--                          sentAt?, emailId?}. Filled by the Mac's prepare
--                          answer (agent token), edited by an owner from the
--                          Bill screen, stamped when the group is sent.
--
-- Additive only: one jsonb column with a default, so every existing row reads
-- exactly as before. 0019 granted service_role select and insert on
-- send_groups ("made, never edited"); the message is the one thing that is
-- edited, so update is granted now. RLS stays as 0019 left it: enabled, no
-- policies, nothing for anon or authenticated.

begin;

alter table public.send_groups
  add column if not exists message jsonb not null default '{}'::jsonb;

grant update (message) on table public.send_groups to service_role;

comment on column public.send_groups.message is 'The working email of the group: subject, body, to, cc, intro, who last changed it; sentAt and emailId once it went out.';

commit;
