-- Billing step 1 (Saddlewood-KB docs/BILLING-ISSUE-PLAN-2026-10-12.md, "Part 2
-- first"): a draft can be looked at, and changed, before anything is locked,
-- and several documents can go out in one email.
--
--   documents.preview_token   the unguessable part of the draft's own link,
--                             /d/p/<preview token>: the page exactly as the
--                             client will see it, under a "PREVIEW, not sent"
--                             band. Opening it is never a line in the proof
--                             record. It opens only while the document is a
--                             draft; after that it says the document was sent.
--   send_groups               documents that go out together in one email
--                             (8009-13 and 8009-14 on 10/12). Each document
--                             still gets its own button and its own "sent" line.
--   documents.send_group_id   the group a document goes out with, if any.
--
-- Additive only. Two new columns, both nullable with no default (so no row is
-- rewritten and every existing row reads exactly as before), one new table,
-- and indexes. Nothing existing is changed, and the freeze on issued
-- documents (0012, documents_freeze) is untouched: it already leaves columns
-- it does not name alone, and the site refuses to change either of these on
-- anything but a draft.
--
-- RLS on the new table is the same as every billing table (0012): enabled,
-- no policies, nothing granted to anon or authenticated. Only the
-- service-role client reaches it, after the route has authorized the actor,
-- so a crew-marked sign-in (0011) cannot read or write it.

begin;

create table if not exists public.send_groups (
  id          uuid primary key default gen_random_uuid(),
  -- What people call the send: "JURY-1012". One spelling per name.
  name        text not null,
  client_id   uuid references public.clients (id) on delete restrict,
  note        text not null default '',
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  constraint send_groups_name_check check (btrim(name) <> '' and length(name) <= 60)
);

create unique index if not exists send_groups_name_uidx on public.send_groups (lower(name));

alter table public.documents
  add column if not exists preview_token text,
  add column if not exists send_group_id uuid references public.send_groups (id) on delete restrict;

-- Same shape as the client's token. Every existing row is null, so this passes as it is added.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_preview_token_check' and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_preview_token_check check (preview_token is null or preview_token ~ '^[0-9a-f]{32}$');
  end if;
end;
$$;

create unique index if not exists documents_preview_token_uidx on public.documents (preview_token) where preview_token is not null;
create index if not exists documents_send_group_idx on public.documents (send_group_id) where send_group_id is not null;

alter table public.send_groups enable row level security;
revoke all on table public.send_groups from anon, authenticated;
-- The hosted project grants everything on a new table to service_role by
-- default; give back only what is used (groups are made, never edited).
revoke all on table public.send_groups from service_role;
grant select, insert on table public.send_groups to service_role;

comment on table public.send_groups is 'Documents that go out together in one email. Service-role access only.';
comment on column public.documents.preview_token is 'The draft''s preview link, /d/p/<preview_token>. Opens only while the document is a draft; never counted as a view.';
comment on column public.documents.send_group_id is 'The send group this document goes out with, if any.';

commit;
