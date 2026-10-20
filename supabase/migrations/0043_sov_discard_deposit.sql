-- Progress draws (0041), from the PR #34 review.
--
-- 1. A draft draw can be discarded: the app deletes its sov_progress rows and
--    then the draft document (drafts may be deleted, 0012). Grant the delete.
-- 2. A draw records the deposit it credited back as a row with line_key
--    'deposit' (amount_cents negative), so the next draw knows how much of the
--    deposit is left to credit.

begin;

grant delete on table public.sov_progress to service_role;

alter table public.sov_progress drop constraint if exists sov_progress_key_check;
alter table public.sov_progress
  add constraint sov_progress_key_check check (line_key ~ '^(sov|co):[0-9]+$' or line_key = 'deposit');

comment on table public.sov_progress is 'What each progress draw billed per SOV line or change order, and the deposit it credited back (line_key deposit); billed to date counts draws whose invoice is not void. Service-role access only.';

commit;
