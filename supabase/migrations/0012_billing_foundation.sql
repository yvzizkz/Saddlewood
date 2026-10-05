-- The foundation for doing our own estimates, change orders and invoices
-- instead of Joist (Saddlewood-KB docs/SADDLEWOOD-APP-SPEC-2026-10-05.md,
-- section 3). Four things nothing else can stand without:
--
--   clients            who we bill, and how each one wants to be billed
--   client_contacts    the people there, by role (accounts payable, PM, principal)
--   jobs (extended)    ONE job list: the row every estimate, crew job, tracker,
--                      change order and invoice points at
--   documents          an estimate, change order, invoice, statement or notice.
--                      Frozen the moment it is issued.
--   document_events    what happened to an issued document: sent, delivered,
--                      bounced, viewed. Append-only. This is the record we put
--                      in front of a client who says "we never got it".
--
-- The two promises this file makes are kept by the database itself, not by
-- the application remembering to behave:
--
--   1. An issued document cannot be edited. A correction is a new revision
--      (documents.supersedes) or a credit. Only "void, with a reason" is left.
--   2. A document_events row cannot be changed or deleted by anyone, the
--      service role included.
--
-- RLS is enabled with NO policies on the new tables, same as the crew and bot
-- tables: only the service-role client reaches them, after the API route has
-- authorized the actor.

begin;

-- ---------------------------------------------------------------------------
-- 1. clients and their people
-- ---------------------------------------------------------------------------

-- `billing` is the client's billing profile: where an invoice goes, what must
-- be attached, their cutoff day, terms and how they pay. Kept as JSON because
-- every client is different and the shape will grow; src/lib/billing/types.ts
-- (BillingProfile) is the reading of it.
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'other',
  billing     jsonb not null default '{}'::jsonb,
  note        text not null default '',
  active      boolean not null default true,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint clients_kind_check check (kind in ('gc', 'homeowner', 'other'))
);

create unique index if not exists clients_name_uidx on public.clients (lower(name));

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create table if not exists public.client_contacts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  phone       text not null default '',
  role        text not null default 'other',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint client_contacts_role_check check (role in ('ap', 'pm', 'principal', 'other'))
);

create index if not exists client_contacts_client_idx on public.client_contacts (client_id);

drop trigger if exists trg_client_contacts_updated_at on public.client_contacts;
create trigger trg_client_contacts_updated_at
  before update on public.client_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. one job list
-- ---------------------------------------------------------------------------

-- public.jobs already exists (the estimate pipeline writes it). It becomes the
-- registry by learning who the client is and which of the older, separate
-- lists describe the same job:
--   crew_job_id   the crew app's job (crew_jobs.id), where time and receipts land
--   tracker_id    its progress tracker (progress_trackers.id), if it has one
--   number_prefix the front of its document numbers, e.g. '8009' in 8009-11
--   billing       what differs from the client's profile on this one job
alter table public.jobs
  add column if not exists client_id uuid references public.clients (id) on delete set null,
  add column if not exists crew_job_id text references public.crew_jobs (id) on delete set null,
  add column if not exists tracker_id text,
  add column if not exists number_prefix text,
  add column if not exists billing jsonb not null default '{}'::jsonb;

create index if not exists jobs_client_idx on public.jobs (client_id);
create unique index if not exists jobs_crew_job_uidx on public.jobs (crew_job_id) where crew_job_id is not null;
create unique index if not exists jobs_tracker_uidx on public.jobs (tracker_id) where tracker_id is not null;

-- ---------------------------------------------------------------------------
-- 3. documents
-- ---------------------------------------------------------------------------

-- `snapshot` is the whole document as the client sees it (lines, totals,
-- terms, who it is addressed to). `token` is the unguessable part of the
-- client's link, /d/<token>; it is set when the document is issued.
-- Money is whole cents.
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  job_id        uuid references public.jobs (id) on delete restrict,
  client_id     uuid references public.clients (id) on delete restrict,
  number        text not null,
  title         text not null default '',
  status        text not null default 'draft',
  revision      integer not null default 1,
  supersedes    uuid references public.documents (id) on delete restrict,
  snapshot      jsonb not null default '{}'::jsonb,
  total_cents   bigint not null default 0,
  due_date      date,
  token         text,
  issued_at     timestamptz,
  issued_by     text not null default '',
  void_reason   text not null default '',
  voided_at     timestamptz,
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint documents_kind_check check (kind in ('estimate', 'change_order', 'invoice', 'statement', 'notice')),
  constraint documents_status_check check (status in ('draft', 'issued', 'void')),
  constraint documents_issued_check check (status = 'draft' or (token is not null and issued_at is not null)),
  constraint documents_void_check check (status <> 'void' or void_reason <> '')
);

-- One number per kind, per job, per revision. Joist let 8009-10 exist twice;
-- this is what stops that. A draft holds its number too, so two drafts cannot
-- race for the same one.
create unique index if not exists documents_number_uidx
  on public.documents (kind, coalesce(job_id, '00000000-0000-0000-0000-000000000000'::uuid), number, revision);
create unique index if not exists documents_token_uidx on public.documents (token) where token is not null;
create index if not exists documents_job_idx on public.documents (job_id, kind, status);
create index if not exists documents_client_idx on public.documents (client_id, kind, status);

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- Promise 1. Once a document is issued, the only change left is voiding it.
create or replace function public.documents_freeze()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'an issued document cannot be deleted (%, %)', old.kind, old.number
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if old.status = 'void' then
    raise exception 'a void document cannot be changed (%, %)', old.kind, old.number
      using errcode = 'check_violation';
  end if;

  -- old.status = 'issued': everything the client was shown stays as it was.
  if new.status = 'draft'
     or new.kind is distinct from old.kind
     or new.job_id is distinct from old.job_id
     or new.client_id is distinct from old.client_id
     or new.number is distinct from old.number
     or new.title is distinct from old.title
     or new.revision is distinct from old.revision
     or new.supersedes is distinct from old.supersedes
     or new.snapshot is distinct from old.snapshot
     or new.total_cents is distinct from old.total_cents
     or new.due_date is distinct from old.due_date
     or new.token is distinct from old.token
     or new.issued_at is distinct from old.issued_at
     or new.issued_by is distinct from old.issued_by
  then
    raise exception 'an issued document cannot be edited; issue a new revision or void it (%, %)', old.kind, old.number
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_documents_freeze on public.documents;
create trigger trg_documents_freeze
  before update or delete on public.documents
  for each row execute function public.documents_freeze();

-- ---------------------------------------------------------------------------
-- 4. document_events: the proof record
-- ---------------------------------------------------------------------------

-- `kind`:
--   sent              we sent it (detail: to, cc, attachments)
--   delivered         the mail service says the other side accepted it
--   bounced           it did not arrive
--   complained        the recipient marked it as spam
--   viewed            the client's link was opened (detail: ip, ua)
--   downloaded        the PDF was fetched from the link
--   portal_submitted  entered by hand: uploaded to the client's own portal
--   note              anything else worth keeping with the document
-- `automatic` marks a view that looks like a mail scanner following the link,
-- not a person (src/lib/billing/proof.ts). It is kept, and left out of what we
-- show a client.
-- `email_id` is the mail service's id for a send; delivery reports come back
-- carrying it. `dedupe` stops the same report being recorded twice.
create table if not exists public.document_events (
  id           bigint generated always as identity primary key,
  document_id  uuid not null references public.documents (id) on delete restrict,
  kind         text not null,
  at           timestamptz not null default now(),
  actor        text not null default '',
  automatic    boolean not null default false,
  email_id     text,
  dedupe       text,
  detail       jsonb not null default '{}'::jsonb,
  constraint document_events_kind_check check (
    kind in ('sent', 'delivered', 'bounced', 'complained', 'viewed', 'downloaded', 'portal_submitted', 'note')
  )
);

create index if not exists document_events_document_idx on public.document_events (document_id, at);
create index if not exists document_events_email_idx on public.document_events (email_id) where email_id is not null;
create unique index if not exists document_events_dedupe_uidx on public.document_events (dedupe) where dedupe is not null;

-- Promise 2. Rows go in and stay as they are.
create or replace function public.document_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'document_events is append-only' using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_document_events_append_only on public.document_events;
create trigger trg_document_events_append_only
  before update or delete on public.document_events
  for each row execute function public.document_events_append_only();

drop trigger if exists trg_document_events_no_truncate on public.document_events;
create trigger trg_document_events_no_truncate
  before truncate on public.document_events
  for each statement execute function public.document_events_append_only();

-- ---------------------------------------------------------------------------
-- 5. who may touch these
-- ---------------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.documents enable row level security;
alter table public.document_events enable row level security;

revoke all on table
  public.clients, public.client_contacts, public.documents, public.document_events
from anon, authenticated;

grant select, insert, update, delete on table
  public.clients, public.client_contacts, public.documents
to service_role;

-- No update or delete to grant: the trigger would refuse them anyway.
grant select, insert on table public.document_events to service_role;

comment on table public.clients is 'Who we bill and how each wants to be billed (billing profile). Service-role access only.';
comment on table public.client_contacts is 'People at a client, by role. Service-role access only.';
comment on table public.documents is 'Estimates, change orders, invoices, statements, notices. Frozen once issued. Service-role access only.';
comment on table public.document_events is 'Sent, delivered, viewed: the proof record for an issued document. Append-only. Service-role access only.';

commit;
