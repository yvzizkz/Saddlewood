-- ============================================================================
-- Saddlewood Estimate Portal — Database Schema
-- Run once in Supabase SQL Editor (or applied via MCP).
-- Idempotent: safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Trigger function: bump updated_at on every UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. jobs
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  client_name     text,
  address         text,
  ahj             text,
  bid_due_date    date,
  project_type    text,
  gc_name         text,
  client_email    text,
  client_phone    text,
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Partial unique index handles NULL address (Postgres treats NULL != NULL).
-- Required by /api/estimates/ingest upsert(onConflict: "name,address").
create unique index if not exists jobs_name_address_uidx
  on public.jobs (name, coalesce(address, ''));

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. estimates
-- ---------------------------------------------------------------------------
create table if not exists public.estimates (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs(id) on delete cascade,
  version             integer not null default 1,
  parent_estimate_id  uuid references public.estimates(id) on delete set null,
  is_ai_baseline      boolean not null default true,
  review_status       text not null default 'draft',
    -- values: draft, in_review, approved, sent, archived, cancelled, changes_requested
  overhead_pct        numeric(5,2) not null default 15,
  profit_pct          numeric(5,2) not null default 10,
  contingency_pct     numeric(5,2) not null default 5,
  gc_sub_markup_pct   numeric(5,2) not null default 10,
  output_format       text not null default 'detailed',
    -- values: detailed, trade_summary, summary, unit_price_schedule, allowance_schedule
  direct_cost         numeric(14,2),
  grand_total         numeric(14,2),
  pipeline_version    text,
  ingest_hash         text,
  ingested_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (job_id, version)
);

create unique index if not exists estimates_ingest_hash_uidx
  on public.estimates (ingest_hash)
  where ingest_hash is not null;

create index if not exists estimates_job_id_idx on public.estimates (job_id);
create index if not exists estimates_review_status_idx on public.estimates (review_status);

drop trigger if exists trg_estimates_updated_at on public.estimates;
create trigger trg_estimates_updated_at
  before update on public.estimates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. estimate_trades
-- ---------------------------------------------------------------------------
create table if not exists public.estimate_trades (
  id                       uuid primary key default gen_random_uuid(),
  estimate_id              uuid not null references public.estimates(id) on delete cascade,
  trade_name               text not null,
  trade_status             text not null default 'SP',
    -- values: SP, SUB, DEFERRED, NIS
  sort_order               integer not null default 0,
  labor_rate_override      numeric(10,4),
  ai_blended_labor_rate    numeric(10,4),
  subtotal                 numeric(14,2),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists estimate_trades_estimate_id_idx
  on public.estimate_trades (estimate_id);

drop trigger if exists trg_estimate_trades_updated_at on public.estimate_trades;
create trigger trg_estimate_trades_updated_at
  before update on public.estimate_trades
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. estimate_line_items
-- ---------------------------------------------------------------------------
create table if not exists public.estimate_line_items (
  id                     uuid primary key default gen_random_uuid(),
  trade_id               uuid not null references public.estimate_trades(id) on delete cascade,
  description            text not null,
  area_location          text,
  quantity               numeric(14,4) not null default 0,
  unit                   text,
  material_unit_cost     numeric(14,4) not null default 0,
  labor_unit_cost        numeric(14,4) not null default 0,
  labor_hours_per_unit   numeric(10,4),
  total                  numeric(16,4)
    generated always as ((quantity * material_unit_cost) + (quantity * labor_unit_cost)) stored,
  dimension_type         text,
    -- values: written, scaled, schedule, calculated, assumed
  source_sheet           text,
  source_grid            text,
  confidence             text,
    -- values: high, medium, low
  flags                  text[] not null default array[]::text[],
  is_allowance           boolean not null default false,
  is_deleted             boolean not null default false,
  is_manual_override     boolean not null default false,
  ai_baseline_snapshot   jsonb,
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists estimate_line_items_trade_id_idx
  on public.estimate_line_items (trade_id);

create index if not exists estimate_line_items_active_idx
  on public.estimate_line_items (trade_id)
  where is_deleted = false;

drop trigger if exists trg_estimate_line_items_updated_at on public.estimate_line_items;
create trigger trg_estimate_line_items_updated_at
  before update on public.estimate_line_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. estimate_overrides (append-only audit log)
-- ---------------------------------------------------------------------------
create table if not exists public.estimate_overrides (
  id              uuid primary key default gen_random_uuid(),
  estimate_id     uuid not null references public.estimates(id) on delete cascade,
  trade_id        uuid references public.estimate_trades(id) on delete set null,
  line_item_id    uuid references public.estimate_line_items(id) on delete set null,
  field_name      text not null,
  old_value       text,
  new_value       text,
  changed_by      text,
  created_at      timestamptz not null default now()
);

create index if not exists estimate_overrides_estimate_id_idx
  on public.estimate_overrides (estimate_id);
create index if not exists estimate_overrides_line_item_id_idx
  on public.estimate_overrides (line_item_id);

-- ---------------------------------------------------------------------------
-- 6. bid_log
-- ---------------------------------------------------------------------------
create table if not exists public.bid_log (
  id                 uuid primary key default gen_random_uuid(),
  estimate_id        uuid not null references public.estimates(id) on delete cascade,
  status             text not null default 'pending',
    -- values: pending, won, lost, no_decision, cancelled
  submitted_amount   numeric(14,2),
  loss_reason        text,
    -- values: price_too_high, timeline_conflict, existing_sub, no_decision, client_cancelled, other
  competitor_price   numeric(14,2),
  notes              text,
  decided_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists bid_log_estimate_id_idx on public.bid_log (estimate_id);
create index if not exists bid_log_status_idx on public.bid_log (status);

drop trigger if exists trg_bid_log_updated_at on public.bid_log;
create trigger trg_bid_log_updated_at
  before update on public.bid_log
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. export_links
-- ---------------------------------------------------------------------------
create table if not exists public.export_links (
  id                  uuid primary key default gen_random_uuid(),
  estimate_id         uuid not null references public.estimates(id) on delete cascade,
  token               text not null unique,
  format              text not null,
    -- values: detailed, trade_summary, summary, unit_price_schedule, allowance_schedule
  xlsx_storage_path   text,
  docx_storage_path   text,
  pdf_storage_path    text,
  expires_at          timestamptz not null,
  view_count          integer not null default 0,
  is_revoked          boolean not null default false,
  last_viewed_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists export_links_token_idx on public.export_links (token);
create index if not exists export_links_estimate_id_idx on public.export_links (estimate_id);

drop trigger if exists trg_export_links_updated_at on public.export_links;
create trigger trg_export_links_updated_at
  before update on public.export_links
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. email_log
-- ---------------------------------------------------------------------------
create table if not exists public.email_log (
  id                   uuid primary key default gen_random_uuid(),
  estimate_id          uuid references public.estimates(id) on delete set null,
  recipient            text not null,
  template             text,
  subject              text,
  resend_message_id    text,
  status               text not null default 'queued',
    -- values: queued, sent, delivered, failed, bounced
  error_message        text,
  sent_at              timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists email_log_estimate_id_idx on public.email_log (estimate_id);
create index if not exists email_log_recipient_idx on public.email_log (recipient);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.jobs                 enable row level security;
alter table public.estimates            enable row level security;
alter table public.estimate_trades      enable row level security;
alter table public.estimate_line_items  enable row level security;
alter table public.estimate_overrides   enable row level security;
alter table public.bid_log              enable row level security;
alter table public.export_links         enable row level security;
alter table public.email_log            enable row level security;

-- Authenticated role (Marco) gets full access on all tables.
-- Service role bypasses RLS entirely, so the ingest endpoint is unaffected.

drop policy if exists "auth_full_access" on public.jobs;
create policy "auth_full_access" on public.jobs
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_full_access" on public.estimates;
create policy "auth_full_access" on public.estimates
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_full_access" on public.estimate_trades;
create policy "auth_full_access" on public.estimate_trades
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_full_access" on public.estimate_line_items;
create policy "auth_full_access" on public.estimate_line_items
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_full_access" on public.estimate_overrides;
create policy "auth_full_access" on public.estimate_overrides
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_full_access" on public.bid_log;
create policy "auth_full_access" on public.bid_log
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_full_access" on public.export_links;
create policy "auth_full_access" on public.export_links
  for all to authenticated using (true) with check (true);

drop policy if exists "auth_full_access" on public.email_log;
create policy "auth_full_access" on public.email_log
  for all to authenticated using (true) with check (true);

-- Anon role: SELECT on export_links only when still valid.
-- The /share/[token] route uses the service role client for the actual estimate
-- data render, so anon does not need direct access to estimates/trades/line_items.
drop policy if exists "anon_read_valid_export_links" on public.export_links;
create policy "anon_read_valid_export_links" on public.export_links
  for select to anon
  using (is_revoked = false and expires_at > now());
