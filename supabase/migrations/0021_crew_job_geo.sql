-- Where a job is on the map, so a punch can be compared to it (the owners and
-- the supervisor see "2.1 mi from the job" on a clock-in or clock-out; the
-- worker is never told). Filled by the site when a job's address is set or
-- changed, or by "Find on the map" on the job sheet; the Mac may set it too.
--
--   crew_jobs.geo   {"lat": number, "lng": number,
--                    "source": "census" | "nominatim" | "owner",
--                    "at": ISO timestamp}
--                   null = not placed (no address, or nothing found)
--
-- Additive only: one nullable jsonb column with no default, so every existing
-- row reads exactly as before. RLS stays as 0011 left it (enabled, no
-- policies, nothing for anon or authenticated), and the service role already
-- holds select, insert, update and delete on the whole table (0011), which
-- covers a new column; nothing more to grant.

begin;

alter table public.crew_jobs
  add column if not exists geo jsonb;

comment on column public.crew_jobs.geo is 'Where the job is: {lat, lng, source: census|nominatim|owner, at}. Null until the address is placed. Punches are compared to it for the owners; never shown to the crew.';

commit;
