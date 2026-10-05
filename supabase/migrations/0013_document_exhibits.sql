-- What goes with a document: the original invoice it refers to, the waiver
-- that was sent for it. Shown on the client's page (/d/<token>) as small
-- links, so nothing has to be attached to the email, and every opening is
-- written to the proof record.
--
-- A frozen document's own content never changes. Its exhibits are a list
-- beside it: rows are added with a date, and a wrong one is taken down with
-- a reason, never edited or deleted.

begin;

create table if not exists public.document_exhibits (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete restrict,
  -- Which line of the document it belongs under; null = the document as a whole.
  line_index    integer,
  label         text not null,
  kind          text not null,
  -- kind 'link': where it goes (an approved site only; checked in the app).
  url           text,
  -- kind 'file': where it sits in the private "billing" bucket.
  storage_path  text,
  content_type  text,
  bytes         bigint,
  sha256        text,
  added_at      timestamptz not null default now(),
  added_by      text not null default '',
  removed_at    timestamptz,
  remove_reason text not null default '',
  constraint document_exhibits_kind_check check (kind in ('link', 'file')),
  constraint document_exhibits_target_check check (
    (kind = 'link' and url is not null and storage_path is null)
    or (kind = 'file' and storage_path is not null and url is null)
  ),
  constraint document_exhibits_line_check check (line_index is null or line_index >= 0),
  constraint document_exhibits_removed_check check (removed_at is null or remove_reason <> '')
);

create index if not exists document_exhibits_document_idx on public.document_exhibits (document_id, added_at);

-- The only change a row may ever see: being taken down, once, with a reason.
create or replace function public.document_exhibits_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'document_exhibits rows are not deleted; take one down with a reason' using errcode = 'check_violation';
  end if;
  if old.removed_at is not null then
    raise exception 'this exhibit was already taken down' using errcode = 'check_violation';
  end if;
  if new.removed_at is null or new.remove_reason = '' then
    raise exception 'an exhibit can only be taken down, with a reason' using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - 'removed_at' - 'remove_reason') is distinct from (to_jsonb(old) - 'removed_at' - 'remove_reason') then
    raise exception 'an exhibit cannot be edited' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_document_exhibits_guard on public.document_exhibits;
create trigger trg_document_exhibits_guard
  before update or delete on public.document_exhibits
  for each row execute function public.document_exhibits_guard();

drop trigger if exists trg_document_exhibits_no_truncate on public.document_exhibits;
create trigger trg_document_exhibits_no_truncate
  before truncate on public.document_exhibits
  for each statement execute function public.document_exhibits_guard();

alter table public.document_exhibits enable row level security;
revoke all on table public.document_exhibits from anon, authenticated, service_role;
grant select, insert, update on table public.document_exhibits to service_role;

comment on table public.document_exhibits is 'Original invoices and waivers shown with an issued document. Added and taken down, never edited. Service-role access only.';

-- Private bucket: files leave only through /d/<token>/x/<id>, which checks the
-- document's token and writes the opening to the proof record.
insert into storage.buckets (id, name, public, file_size_limit)
values ('billing', 'billing', false, 10485760)
on conflict (id) do nothing;

commit;
