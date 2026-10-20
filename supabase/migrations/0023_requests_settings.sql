-- Material requests from the field, and the owners' editable settings
-- (Lando, 2026-10-19: "if at close out the worker says material is needed,
-- set up a will call so the items can be ready for pick up upon approval
-- through the right process").
--
-- The flow: a worker's end of day says what the job needs (or a PM or an
-- owner adds a request by hand, or the Mac reads one out of a voice memo).
-- The project manager on that job approves it up to requests.pmLimitCents;
-- anything above goes to the owners, and above requests.ownerLimitCents both
-- owners are told and one decides. "Talk to me" keeps it open. Once the
-- material is ordered and staged for will-call, the request becomes a
-- crew_pickups row (0016) for the runner, and the pickup's picked / delivered
-- mirror back here.
--
--   app_settings     key -> jsonb value, owners edit them in the app
--   crew_requests    one row per request, with where it came from and what
--                    became of it
--
-- Additive only. Same rules as 0011: RLS on with no policies, service role only.

begin;

-- ---- settings the owners can change in the app ------------------------------------

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  text not null default '',
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value, updated_by) values
  -- A project manager may approve a material request up to this much ($500).
  ('requests.pmLimitCents', '50000'::jsonb, 'setup'),
  -- Above this ($1,000) both owners are told, and one of them decides.
  ('requests.ownerLimitCents', '100000'::jsonb, 'setup'),
  -- Who the owners' first push goes to: "marco", "lando" or "either" (both).
  ('requests.answersFirst', '"either"'::jsonb, 'setup'),
  -- A punch further than this from the job (meters) shows red to the owners (half a mile).
  ('crew.farFromJobM', '805'::jsonb, 'setup')
on conflict (key) do nothing;

-- ---- material requests ------------------------------------------------------------

create table if not exists public.crew_requests (
  id             bigserial primary key,
  kind           text not null default 'material',
  job_id         text references public.crew_jobs (id) on update cascade on delete set null,
  job_name       text not null default '',
  trade          text not null default '',
  items          text not null,
  qty            text not null default '',
  -- The estimate in cents; null until someone puts a number on it.
  est_cents      integer,
  status         text not null default 'asked',
  -- The seat that asked (crew_people.email).
  asked_by       text not null,
  asked_at       timestamptz not null default now(),
  -- {entryId} when it came out of an end of day (crew_entries.id).
  source         jsonb not null default '{}'::jsonb,
  decided_by     text not null default '',
  decided_at     timestamptz,
  decision_note  text not null default '',
  -- "Talk to me" was answered: it stays asked, and the asker is told.
  talk           boolean not null default false,
  supplier       text not null default '',
  order_ref      text not null default '',
  store          text not null default '',
  -- The will-call pickup made when it was ordered (crew_pickups.id).
  pickup_id      bigint references public.crew_pickups (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint crew_requests_status_check check (status in ('asked', 'approved', 'denied', 'ordered', 'picked', 'delivered', 'cancelled')),
  constraint crew_requests_source_check check (jsonb_typeof(source) = 'object')
);

-- One request per end of day: the site and the Mac may both read the same entry.
create unique index if not exists crew_requests_entry_idx on public.crew_requests ((source->>'entryId')) where source ? 'entryId';
create index if not exists crew_requests_open_idx on public.crew_requests (status) where status in ('asked', 'approved', 'ordered', 'picked');
create index if not exists crew_requests_asked_by_idx on public.crew_requests (asked_by, asked_at desc);
create index if not exists crew_requests_pickup_idx on public.crew_requests (pickup_id) where pickup_id is not null;

alter table public.app_settings enable row level security;
alter table public.crew_requests enable row level security;

revoke all on table public.app_settings, public.crew_requests from anon, authenticated;
grant select, insert, update, delete on table public.app_settings, public.crew_requests to service_role;
grant usage, select on sequence public.crew_requests_id_seq to service_role;

comment on table public.app_settings is 'Settings the owners edit in the app (request limits, who answers first, the far-from-job distance). Service-role access only.';
comment on table public.crew_requests is 'Material requests from the field: asked, approved under the owners'' limits, ordered into a will-call pickup. Service-role access only.';

-- The built-in Project manager group (0018) approves requests up to the PM
-- limit. Never overwrites a group an owner already changed beyond adding the switch.
update public.crew_groups
   set perms = perms || '["requests.approve"]'::jsonb, updated_at = now()
 where id = 'pm' and not (perms ? 'requests.approve');

commit;
