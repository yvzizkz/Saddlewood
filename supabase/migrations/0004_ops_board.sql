-- Ops board: the SOPs, templates, tools, and hires that have to exist before
-- anyone can step into a role at Saddlewood. One row per card, one row per
-- move. The board lives at /internal/ops behind the portal's magic link; the
-- bot and Claude sessions reach the same rows through /api/ops/cards with
-- OPS_AGENT_TOKEN. Source of truth for the card list: Saddlewood-KB
-- docs/OPERATING-MODEL-2026-09-04.md §8.
--
-- RLS is enabled with NO policies on purpose: the anon and authenticated keys
-- can neither read nor write. Every access goes through the service-role
-- client after the API route has authorized the actor.

create table if not exists public.ops_cards (
  id           text primary key,
  title        text not null,
  owner        text not null default 'Lando',
  col          text not null default 'backlog',
  note         text not null default '',
  sort         integer not null default 1000,
  updated_by   text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ops_cards_col_check check (col in ('backlog', 'drafting', 'review', 'live', 'measured')),
  constraint ops_cards_owner_check check (owner in ('Marco', 'Lando', 'Ilene', 'Eli')),
  constraint ops_cards_id_check check (id ~ '^[a-z0-9][a-z0-9-]*$' and length(id) <= 64)
);

drop trigger if exists trg_ops_cards_updated_at on public.ops_cards;
create trigger trg_ops_cards_updated_at
  before update on public.ops_cards
  for each row execute function public.set_updated_at();

create index if not exists ops_cards_col_sort_idx on public.ops_cards (col, sort) where archived_at is null;

create table if not exists public.ops_card_events (
  id        bigint generated always as identity primary key,
  card_id   text not null references public.ops_cards(id) on delete cascade,
  kind      text not null default 'move',
  from_col  text,
  to_col    text,
  actor     text not null,
  at        timestamptz not null default now()
);

create index if not exists ops_card_events_at_idx on public.ops_card_events (at desc);

alter table public.ops_cards enable row level security;
alter table public.ops_card_events enable row level security;

comment on table public.ops_cards is 'Ops board cards. Columns: backlog, drafting, review (owner review), live, measured. Service-role access only.';
comment on table public.ops_card_events is 'Audit of card creates, moves, updates, archives. actor is an allowlisted email or an agent name.';
