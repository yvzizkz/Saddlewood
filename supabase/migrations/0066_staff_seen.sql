-- When an office person last opened the app. Crew have crew_people.last_seen_at;
-- owners and office staff have no seat row, so the January move couldn't see them.

create table if not exists public.staff_seen (
  email         text primary key,
  last_seen_at  timestamptz not null default now()
);

alter table public.staff_seen enable row level security;
revoke all on table public.staff_seen from anon, authenticated, service_role;
grant select, insert, update on table public.staff_seen to service_role;
comment on table public.staff_seen is 'When a staff sign-in last opened the app. Service-role access only.';
