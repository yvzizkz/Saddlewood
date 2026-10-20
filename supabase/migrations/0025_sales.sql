-- Sales: one place for every prospect from the first call to the signed job,
-- and the estimates priced for them in the app (app spec §6, Phase 3:
-- "Estimates and proposals send, accept, open the job").
--
--   sales_opportunities   the prospect: who, what, where, how big, which
--                         stage, the next step and when. Becomes a job when won.
--   sales_events          its timeline: calls, notes, stage moves, estimates
--                         issued, viewings, the acceptance. Append-only, like
--                         document_events, so the history cannot be tidied up.
--   sales_estimates       working drafts, edited freely (`body` is the whole
--                         estimate: sections, lines, packages, markups, how it
--                         is presented). Versioned per opportunity.
--
-- What a client is SENT is not stored here: issuing an estimate writes a
-- documents row of kind 'estimate' (0012) whose snapshot carries the
-- proposal, so the client's link (/d/<token>), its viewing record and the
-- freeze on issued documents are the billing foundation's own.
--
-- document_events gains three kinds for a proposal:
--   accepted   the client accepted on the link (detail: name, package,
--              add-ons, total, ip, ua)
--   signed     a signature, the client's or ours (detail: role, name, how,
--              the picture, the consent words, a SHA-256 of the frozen
--              proposal, ip, ua); append-only like every proof line
--   selected   reserved for recording a client's choice without accepting
-- Widening a check constraint rewrites nothing and changes no existing row.
--
-- Numbers: opportunities are <yy>-<nnnn> from one sequence ("26-0007"); the
-- proposal sent for one is EST-<that number>, revision 1, 2, ... in documents.
--
-- RLS as every billing table (0012): enabled, no policies, nothing granted to
-- anon or authenticated. Only the service-role client reaches these tables,
-- after the route has decided who is asking, so a crew-marked sign-in (0011)
-- cannot read them; crew referrals go through a route that writes for them.

begin;

create sequence if not exists public.sales_opportunity_seq;

create table if not exists public.sales_opportunities (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,
  title          text not null,
  stage          text not null default 'lead',
  kind           text not null default 'remodel',
  source         text not null default 'call',
  -- { name, company, phone, email } of the person we deal with. A prospect is
  -- not a client yet; client_id links one once they are (or already were).
  contact        jsonb not null default '{}'::jsonb,
  address        text not null default '',
  client_id      uuid references public.clients (id) on delete restrict,
  job_id         uuid references public.jobs (id) on delete restrict,
  value_cents    bigint not null default 0,
  probability    integer,
  owner          text not null default '',
  next_step      text not null default '',
  next_step_on   date,
  bid_due        date,
  lost_reason    text not null default '',
  notes          text not null default '',
  tags           text[] not null default array[]::text[],
  -- Where it came from outside the app ("phone:+16023633265", "bid:<id>"), so
  -- the same caller or invite is never tracked twice.
  external_ref   text,
  created_by     text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  stage_at       timestamptz not null default now(),
  closed_at      timestamptz,
  constraint sales_opportunities_stage_check check (
    stage in ('lead', 'qualified', 'site_visit', 'estimating', 'proposal_sent', 'negotiating', 'won', 'lost', 'no_bid')
  ),
  constraint sales_opportunities_kind_check check (
    kind in ('remodel', 'addition', 'custom_home', 'framing_sub', 'commercial_ti', 'service', 'other')
  ),
  constraint sales_opportunities_source_check check (
    source in ('call', 'website', 'referral', 'repeat', 'bid_invite', 'field', 'walk_in', 'other')
  ),
  constraint sales_opportunities_title_check check (btrim(title) <> '' and length(title) <= 160),
  constraint sales_opportunities_value_check check (value_cents >= 0),
  constraint sales_opportunities_probability_check check (probability is null or probability between 0 and 100)
);

create unique index if not exists sales_opportunities_external_uidx
  on public.sales_opportunities (external_ref) where external_ref is not null;
create index if not exists sales_opportunities_stage_idx on public.sales_opportunities (stage, next_step_on);
create index if not exists sales_opportunities_client_idx on public.sales_opportunities (client_id);

drop trigger if exists trg_sales_opportunities_updated_at on public.sales_opportunities;
create trigger trg_sales_opportunities_updated_at
  before update on public.sales_opportunities
  for each row execute function public.set_updated_at();

-- The timeline. `kind` is what happened; `text` is what a person wrote.
create table if not exists public.sales_events (
  id              bigint generated always as identity primary key,
  opportunity_id  uuid not null references public.sales_opportunities (id) on delete restrict,
  kind            text not null,
  at              timestamptz not null default now(),
  actor           text not null default '',
  text            text not null default '',
  detail          jsonb not null default '{}'::jsonb,
  constraint sales_events_kind_check check (
    kind in ('created', 'stage', 'note', 'call', 'text', 'email', 'visit', 'estimate', 'issued', 'viewed', 'accepted', 'signed', 'emailed', 'job', 'field')
  ),
  constraint sales_events_text_check check (length(text) <= 4000)
);

create index if not exists sales_events_opportunity_idx on public.sales_events (opportunity_id, at);

-- Same promise as document_events: rows go in and stay as they are.
create or replace function public.sales_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'sales_events is append-only' using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_sales_events_append_only on public.sales_events;
create trigger trg_sales_events_append_only
  before update or delete on public.sales_events
  for each row execute function public.sales_events_append_only();

drop trigger if exists trg_sales_events_no_truncate on public.sales_events;
create trigger trg_sales_events_no_truncate
  before truncate on public.sales_events
  for each statement execute function public.sales_events_append_only();

create table if not exists public.sales_estimates (
  id                  uuid primary key default gen_random_uuid(),
  opportunity_id      uuid not null references public.sales_opportunities (id) on delete restrict,
  version             integer not null,
  name                text not null default '',
  status              text not null default 'draft',
  body                jsonb not null,
  -- The lead package's sell price and our cost, kept with each save so lists
  -- never have to price every estimate.
  sell_cents          bigint not null default 0,
  cost_cents          bigint not null default 0,
  -- The last proposal issued from it (documents, kind 'estimate').
  document_id         uuid references public.documents (id) on delete restrict,
  -- The pipeline estimate it was imported from, if any.
  source_estimate_id  uuid references public.estimates (id) on delete set null,
  created_by          text not null default '',
  created_at          timestamptz not null default now(),
  updated_by          text not null default '',
  updated_at          timestamptz not null default now(),
  constraint sales_estimates_status_check check (status in ('draft', 'issued', 'archived')),
  constraint sales_estimates_body_check check (jsonb_typeof(body) = 'object'),
  unique (opportunity_id, version)
);

create index if not exists sales_estimates_opportunity_idx on public.sales_estimates (opportunity_id, version desc);
create index if not exists sales_estimates_document_idx on public.sales_estimates (document_id) where document_id is not null;

drop trigger if exists trg_sales_estimates_updated_at on public.sales_estimates;
create trigger trg_sales_estimates_updated_at
  before update on public.sales_estimates
  for each row execute function public.set_updated_at();

-- The client's answer on a proposal link.
alter table public.document_events drop constraint if exists document_events_kind_check;
alter table public.document_events add constraint document_events_kind_check check (
  kind in ('sent', 'delivered', 'bounced', 'complained', 'viewed', 'downloaded', 'portal_submitted', 'note', 'accepted', 'selected', 'signed')
);

-- The company's own choices for Sales (src/lib/sales/settings.ts): default
-- markups, terms, how proposals are presented, signing, proposal mail and
-- who is notified. One row per key; "company" is the only key so far. Owners
-- change it in the app; every change keeps who and when.
create table if not exists public.sales_settings (
  key         text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_by  text not null default '',
  updated_at  timestamptz not null default now(),
  constraint sales_settings_data_check check (jsonb_typeof(data) = 'object')
);

-- The next opportunity number, "26-0007". One sequence for all years: numbers
-- never repeat, and the year in front says when it came in.
create or replace function public.next_sales_number()
returns text
language sql
volatile
as $$
  select to_char(now() at time zone 'America/Phoenix', 'YY') || '-' || lpad(nextval('public.sales_opportunity_seq')::text, 4, '0');
$$;

alter table public.sales_opportunities enable row level security;
alter table public.sales_events enable row level security;
alter table public.sales_estimates enable row level security;
alter table public.sales_settings enable row level security;

revoke all on table public.sales_opportunities, public.sales_events, public.sales_estimates, public.sales_settings from anon, authenticated;
revoke all on table public.sales_opportunities, public.sales_events, public.sales_estimates, public.sales_settings from service_role;
grant select, insert, update on table public.sales_opportunities, public.sales_estimates, public.sales_settings to service_role;
grant select, insert on table public.sales_events to service_role;
revoke all on sequence public.sales_opportunity_seq from anon, authenticated;
grant usage, select on sequence public.sales_opportunity_seq to service_role;
revoke all on function public.next_sales_number() from public, anon, authenticated;
grant execute on function public.next_sales_number() to service_role;

comment on table public.sales_opportunities is 'Prospects from first contact to won/lost; becomes a job when won. Service-role access only.';
comment on table public.sales_events is 'Timeline of a sales opportunity. Append-only. Service-role access only.';
comment on table public.sales_settings is 'Company settings for Sales (defaults, terms, signing, proposal mail). Service-role access only.';
comment on table public.sales_estimates is 'Working estimate drafts (body jsonb); what is sent is a frozen documents row. Service-role access only.';

commit;
