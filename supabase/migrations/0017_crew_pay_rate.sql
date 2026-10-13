-- An hourly pay rate on a crew seat, for the hours export and the owners'
-- Hours view (hours × rate = labor cost). First filled from Buildertrend's
-- "Default labor cost" per user (2026-10-12). Owners only: the site never
-- hands it to a crew session, the supervisor, or the office Mac's feed
-- (src/lib/crew/home.ts). Null = paid some other way (by the job, flat).

begin;

alter table public.crew_people
  add column if not exists pay_rate numeric(8, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crew_people_pay_rate_check') then
    alter table public.crew_people
      add constraint crew_people_pay_rate_check check (pay_rate is null or (pay_rate >= 0 and pay_rate <= 500));
  end if;
end
$$;

commit;
