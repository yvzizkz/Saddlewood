-- 0051: the estimate-era tables become service-role only, like every money
-- table since 0010.
--
-- schema.sql gave jobs, estimates, estimate_trades, estimate_line_items,
-- estimate_overrides, bid_log, export_links and email_log an
-- "auth_full_access" policy: any signed-in session could read and write
-- every row straight through the database API, without touching the site.
-- 0011 added a restrictive rule that shuts crew sessions out, but a staff
-- session still reached jobs (contract value, billing, client details)
-- directly. export_links also let anyone with the public key read the valid
-- links; nothing on the site uses that table any more.
--
-- The site reads these tables with the server key only, after the route or
-- page has checked the caller (src/lib/estimates/queries.ts and
-- src/app/api/estimates/[id]/**, changed with this migration). So after this
-- the browser's keys (anon, authenticated) hold nothing here.
--
-- Apply after 0050. Safe to run twice. Apply the site change first: on the
-- old code the /internal estimate review pages read through the signed-in
-- session and would come up empty once this is in.

begin;

do $$
declare
  t text;
begin
  foreach t in array array['jobs', 'estimates', 'estimate_trades', 'estimate_line_items',
                           'estimate_overrides', 'bid_log', 'export_links', 'email_log']
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop policy if exists "auth_full_access" on public.%I', t);
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
      execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    end if;
  end loop;

  if to_regclass('public.export_links') is not null then
    drop policy if exists "anon_read_valid_export_links" on public.export_links;
  end if;
end
$$;

-- 0011's restrictive staff_sessions_only rule stays: with no permissive
-- policy and no grants left it decides nothing, and it is the guard if a
-- permissive policy is ever added back by hand.

commit;
