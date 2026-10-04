-- The Saddlewood app (/app): staff talk to SaddleWoodBot, approve what it
-- drafted, and hand it duties, from a phone. The bot itself runs on the office
-- Mac; these tables are the mailbox between the two. People write requests and
-- taps here through /api/bot/* with their portal session. The Mac's bridge
-- (Saddlewood-KB bot/app_bridge.py) collects them through /api/bot/sync with
-- OPS_AGENT_TOKEN, does the work with the same rules as a text or an email to
-- the bot, and writes back the replies and a picture of what it is holding.
--
-- RLS is enabled with NO policies, same as the Ops board: the anon and
-- authenticated keys can neither read nor write. Every access goes through the
-- service-role client after the API route has authorized the actor.

-- One conversation per person. `thread` is that person's email.
create table if not exists public.bot_messages (
  id           bigint generated always as identity primary key,
  thread       text not null,
  role         text not null,
  author       text not null,
  body         text not null default '',
  attachments  jsonb not null default '[]'::jsonb,
  status       text not null default 'done',
  lane         text,
  reply_to     bigint references public.bot_messages(id) on delete set null,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  done_at      timestamptz,
  constraint bot_messages_role_check check (role in ('user', 'bot', 'system')),
  constraint bot_messages_status_check check (status in ('queued', 'working', 'done', 'failed')),
  constraint bot_messages_lane_check check (lane is null or lane in ('fast', 'agent'))
);

create index if not exists bot_messages_thread_idx on public.bot_messages (thread, id desc);
create index if not exists bot_messages_open_idx on public.bot_messages (status, lane, id)
  where status in ('queued', 'working');

-- A tap on a button: approve draft 18, snooze a to-do, pause a duty. The Mac
-- decides whether the person may do it; `result` is what it answered.
create table if not exists public.bot_actions (
  id          bigint generated always as identity primary key,
  actor       text not null,
  kind        text not null,
  payload     jsonb not null default '{}'::jsonb,
  lane        text not null default 'fast',
  status      text not null default 'queued',
  result      text not null default '',
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  done_at     timestamptz,
  constraint bot_actions_status_check check (status in ('queued', 'working', 'done', 'failed', 'refused')),
  constraint bot_actions_lane_check check (lane in ('fast', 'agent'))
);

create index if not exists bot_actions_open_idx on public.bot_actions (status, lane, id)
  where status in ('queued', 'working');
create index if not exists bot_actions_recent_idx on public.bot_actions (id desc);

-- What the bot is holding, as the Mac last reported it. One row per section
-- (health, drafts, tasks, ledger, payments, expenses, bids, fixes, automations,
-- duties, activity, people) plus 'bridge', stamped every time the Mac checks in.
create table if not exists public.bot_state (
  key         text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Web Push subscriptions, one per installed browser.
create table if not exists public.bot_push_subscriptions (
  endpoint    text primary key,
  email       text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text not null default '',
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);

create index if not exists bot_push_subscriptions_email_idx on public.bot_push_subscriptions (email);

alter table public.bot_messages enable row level security;
alter table public.bot_actions enable row level security;
alter table public.bot_state enable row level security;
alter table public.bot_push_subscriptions enable row level security;

comment on table public.bot_messages is 'App conversations with SaddleWoodBot. thread = the person''s email. Service-role access only.';
comment on table public.bot_actions is 'Button taps in the app, executed by the Mac bridge. actor is an allowlisted email. Service-role access only.';
comment on table public.bot_state is 'Latest snapshot of what the bot is holding, pushed by the Mac bridge. Service-role access only.';
comment on table public.bot_push_subscriptions is 'Web Push subscriptions for the app. Service-role access only.';

-- Photos and files people attach, and files the bot sends back. Private: the
-- API hands out short-lived signed URLs after checking who is asking.
insert into storage.buckets (id, name, public, file_size_limit)
values ('bot-files', 'bot-files', false, 15728640)
on conflict (id) do nothing;
