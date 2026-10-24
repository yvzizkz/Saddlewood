-- Grants made consistent (cleanup Batch 4). The six oldest tables (0004,
-- 0006, 0007, 0008) were made before the rule every later table follows:
-- revoke everything from anon and authenticated, the server reads and writes
-- with the service role. They kept Supabase's default grants, so a signed-in
-- or anonymous session held every privilege on them, held back only by RLS
-- (on, with no policies). TRUNCATE is not covered by RLS.
--
-- No behavior change: RLS already denied those sessions every row, and no
-- browser code reads these tables (the site uses the server key). The
-- service role keeps what it has; the Ops board deletes goals and cards.
--
-- Safe to run again. Independent of every other migration.

begin;

do $$
declare
  t text;
begin
  foreach t in array array['ops_cards', 'ops_card_events', 'ops_card_comments', 'ops_goals',
                           'progress_trackers', 'progress_tracker_invoices']
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end
$$;

commit;
