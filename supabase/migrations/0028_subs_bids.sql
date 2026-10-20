-- Subcontractors and the bid-out pipeline, phase A (KB docs/JOB-LIFECYCLE-
-- PLAN-2026-10-19.md §7, SOP-008 §2 stages 1 to 5): the sub directory, bid
-- packages from an awarded job or an open opportunity, an invite link per sub,
-- the sub's bid on that link (signed, revisable until the due date), the
-- leveling sheet and the award. Work orders, onboarding files, the sub's own
-- sign-in, invoices and change orders are phases B and C.
--
--   subs              the directory: one row per company, its trades, status
--                     and the onboarding facts SOP-008 rule 1 checks
--   sub_contacts      the people at a sub; invites go to one of them
--   bid_packages      one trade's scope on one job or opportunity: lines with
--                     quantities, our own cost per line (internal, the leveling
--                     plug, never shown to a sub), exclusions, files, due date
--   bid_addenda       numbered changes to a package; every invitee sees them
--   bid_invites       one sub on one package, with its own unguessable link
--   bid_responses     each bid a sub submits, a new row per revision, never
--                     edited: prices per line, inclusions, exclusions, schedule,
--                     validity, deviations, the signature and its fingerprint
--   bid_events        the proof record: sent, viewed, downloaded, submitted,
--                     declined, awarded; append-only
--
-- Files live in a private bucket, "subs". They leave only through routes that
-- check the invite link or a signed-in seat.
--
-- Additive only. Service role only, like every table the app owns.

begin;

-- ---------------------------------------------------------------------------
-- 1. the directory
-- ---------------------------------------------------------------------------

create table if not exists public.subs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  trades          text[] not null default '{}',
  status          text not null default 'prospect',
  phone           text not null default '',
  email           text not null default '',
  address         text not null default '',
  roc_license     text not null default '',
  roc_verified_at timestamptz,
  roc_verified_by text not null default '',
  coi_expires_on  date,
  w9_on_file      boolean not null default false,
  msa_signed_on   date,
  ach_confirmed_at timestamptz,
  ach_confirmed_by text not null default '',
  note            text not null default '',
  created_by      text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint subs_status_check check (status in ('prospect', 'onboarding', 'approved', 'inactive')),
  constraint subs_name_check check (btrim(name) <> '' and length(name) <= 160)
);

create unique index if not exists subs_name_uidx on public.subs (lower(name));
create index if not exists subs_trades_idx on public.subs using gin (trades);

drop trigger if exists trg_subs_updated_at on public.subs;
create trigger trg_subs_updated_at before update on public.subs for each row execute function public.set_updated_at();

create table if not exists public.sub_contacts (
  id          uuid primary key default gen_random_uuid(),
  sub_id      uuid not null references public.subs (id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  phone       text not null default '',
  role        text not null default '',
  is_primary  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sub_contacts_sub_idx on public.sub_contacts (sub_id);

drop trigger if exists trg_sub_contacts_updated_at on public.sub_contacts;
create trigger trg_sub_contacts_updated_at before update on public.sub_contacts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. packages and addenda
-- ---------------------------------------------------------------------------

create table if not exists public.bid_packages (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid references public.jobs (id) on delete set null,
  opportunity_id  uuid references public.sales_opportunities (id) on delete set null,
  trade           text not null,
  title           text not null,
  scope           text not null default '',
  -- [{id, description, qty, unit, note, ourCents}]: ourCents is internal.
  lines           jsonb not null default '[]'::jsonb,
  exclusions      text[] not null default '{}',
  -- [{id, name, path, size, type, at, by}] in the "subs" bucket.
  files           jsonb not null default '[]'::jsonb,
  work_from       date,
  work_to         date,
  site_walk       text not null default '',
  due_at          timestamptz,
  terms           text not null default '',
  status          text not null default 'draft',
  awarded_invite_id uuid,
  awarded_at      timestamptz,
  awarded_by      text not null default '',
  created_by      text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint bid_packages_status_check check (status in ('draft', 'out', 'closed', 'awarded', 'cancelled')),
  constraint bid_packages_for_check check (job_id is not null or opportunity_id is not null),
  constraint bid_packages_title_check check (btrim(title) <> '' and length(title) <= 200)
);

create index if not exists bid_packages_job_idx on public.bid_packages (job_id);
create index if not exists bid_packages_opp_idx on public.bid_packages (opportunity_id);

drop trigger if exists trg_bid_packages_updated_at on public.bid_packages;
create trigger trg_bid_packages_updated_at before update on public.bid_packages for each row execute function public.set_updated_at();

create table if not exists public.bid_addenda (
  id          bigint generated always as identity primary key,
  package_id  uuid not null references public.bid_packages (id) on delete cascade,
  n           integer not null,
  text        text not null,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  constraint bid_addenda_text_check check (btrim(text) <> '' and length(text) <= 4000),
  unique (package_id, n)
);

-- ---------------------------------------------------------------------------
-- 3. invites, bids, the proof record
-- ---------------------------------------------------------------------------

create table if not exists public.bid_invites (
  id            uuid primary key default gen_random_uuid(),
  package_id    uuid not null references public.bid_packages (id) on delete cascade,
  sub_id        uuid not null references public.subs (id) on delete restrict,
  contact_name  text not null default '',
  contact_email text not null default '',
  token         text not null,
  status        text not null default 'invited',
  sent_at       timestamptz,
  viewed_at     timestamptz,
  declined_at   timestamptz,
  decline_note  text not null default '',
  -- What we add for the cost to us of what this bid leaves out (leveling), and why.
  level_add_cents bigint not null default 0,
  level_note    text not null default '',
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint bid_invites_status_check check (status in ('invited', 'declined', 'submitted', 'awarded', 'not_awarded', 'withdrawn')),
  unique (package_id, sub_id)
);

create unique index if not exists bid_invites_token_uidx on public.bid_invites (token);
create index if not exists bid_invites_sub_idx on public.bid_invites (sub_id);

drop trigger if exists trg_bid_invites_updated_at on public.bid_invites;
create trigger trg_bid_invites_updated_at before update on public.bid_invites for each row execute function public.set_updated_at();

alter table public.bid_packages
  drop constraint if exists bid_packages_awarded_fk,
  add constraint bid_packages_awarded_fk foreign key (awarded_invite_id) references public.bid_invites (id) on delete set null;

create table if not exists public.bid_responses (
  id            bigint generated always as identity primary key,
  invite_id     uuid not null references public.bid_invites (id) on delete cascade,
  revision      integer not null,
  -- [{lineId, cents, note}]: cents null = not included in this bid.
  lines         jsonb not null default '[]'::jsonb,
  total_cents   bigint not null,
  inclusions    text not null default '',
  exclusions    text not null default '',
  start_on      date,
  duration      text not null default '',
  valid_days    integer not null default 30,
  deviations    text not null default '',
  note          text not null default '',
  -- [{id, name, path, size, type}] in the "subs" bucket.
  files         jsonb not null default '[]'::jsonb,
  signer_name   text not null,
  signer_title  text not null default '',
  signature     jsonb not null default '{}'::jsonb,
  consent       text not null default '',
  fingerprint   text not null default '',
  ip            text not null default '',
  ua            text not null default '',
  submitted_at  timestamptz not null default now(),
  unique (invite_id, revision)
);

create table if not exists public.bid_events (
  id          bigint generated always as identity primary key,
  package_id  uuid not null references public.bid_packages (id) on delete cascade,
  invite_id   uuid references public.bid_invites (id) on delete cascade,
  kind        text not null,
  at          timestamptz not null default now(),
  actor       text not null default '',
  detail      jsonb not null default '{}'::jsonb,
  constraint bid_events_kind_check check (kind in ('created', 'invited', 'sent', 'viewed', 'downloaded', 'submitted', 'declined', 'addendum', 'awarded', 'not_awarded', 'thanked', 'note', 'reopened', 'cancelled'))
);

create index if not exists bid_events_package_idx on public.bid_events (package_id, at);

-- Bids and the proof record are kept as they were: no edits, no deletes.
create or replace function public.subs_append_only() returns trigger language plpgsql as $$
begin
  raise exception '% rows are kept as they were', tg_table_name;
end;
$$;

drop trigger if exists trg_bid_responses_frozen on public.bid_responses;
create trigger trg_bid_responses_frozen before update or delete on public.bid_responses for each row execute function public.subs_append_only();
drop trigger if exists trg_bid_responses_truncate on public.bid_responses;
create trigger trg_bid_responses_truncate before truncate on public.bid_responses for each statement execute function public.subs_append_only();
drop trigger if exists trg_bid_events_frozen on public.bid_events;
create trigger trg_bid_events_frozen before update or delete on public.bid_events for each row execute function public.subs_append_only();
drop trigger if exists trg_bid_events_truncate on public.bid_events;
create trigger trg_bid_events_truncate before truncate on public.bid_events for each statement execute function public.subs_append_only();

-- ---------------------------------------------------------------------------
-- 4. access and files
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['subs', 'sub_contacts', 'bid_packages', 'bid_addenda', 'bid_invites', 'bid_responses', 'bid_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated, service_role', t);
    execute format('grant select, insert, update on table public.%I to service_role', t);
  end loop;
end $$;

-- A contact may be removed from a sub; nothing else is ever deleted.
grant delete on table public.sub_contacts to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('subs', 'subs', false, 26214400)
on conflict (id) do nothing;

comment on table public.subs is 'Sub directory (SOP-008). Service-role access only.';
comment on table public.bid_packages is 'One trade''s scope out to bid; lines carry our own cost (internal). Service-role access only.';
comment on table public.bid_invites is 'One sub on one package, with its own link. Service-role access only.';
comment on table public.bid_responses is 'Each bid revision a sub submitted, signed; never edited. Service-role access only.';
comment on table public.bid_events is 'Proof record of the bid-out; append-only. Service-role access only.';

commit;
