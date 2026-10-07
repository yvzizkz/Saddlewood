-- Face ID / fingerprint sign-in (WebAuthn passkeys). One row per passkey a
-- person enrolled on a device. The public key is what lets the server check
-- the signature the phone makes at sign-in; the counter catches a cloned
-- authenticator. Only the server (service role) reads or writes these; the
-- person's own session never sees the table.

begin;

create table if not exists public.passkeys (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  email          text not null,
  credential_id  text not null unique,          -- base64url
  public_key     text not null,                 -- base64url COSE key
  counter        bigint not null default 0,
  transports     text[] not null default '{}',
  device_label   text not null default '',
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

create index if not exists passkeys_user_idx on public.passkeys (user_id);

alter table public.passkeys enable row level security;

revoke all on table public.passkeys from anon, authenticated, service_role;
grant select, insert, update, delete on table public.passkeys to service_role;

commit;
