-- Money in. A payment is what arrived (date, gross amount, fee, how, their
-- reference); its allocations say which document, and which line of it, the
-- money pays. One check can cover several invoices; one invoice can be paid
-- in parts. A wrong payment is voided with a reason, never edited or deleted,
-- so the record of what we believed and when stays whole.

begin;

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.clients (id) on delete restrict,
  received_on   date not null,
  amount_cents  bigint not null,
  fee_cents     bigint not null default 0,
  method        text not null,
  reference     text not null default '',
  note          text not null default '',
  -- Where the knowledge came from: a Melio receipt, a bank alert, Ilene.
  evidence      text not null default '',
  recorded_by   text not null default '',
  recorded_at   timestamptz not null default now(),
  voided_at     timestamptz,
  void_reason   text not null default '',
  constraint payments_amount_check check (amount_cents > 0),
  constraint payments_fee_check check (fee_cents >= 0 and fee_cents < amount_cents),
  constraint payments_method_check check (method in ('check', 'wire', 'ach', 'melio', 'zelle', 'card', 'cash', 'other')),
  constraint payments_void_check check (voided_at is null or void_reason <> '')
);

create index if not exists payments_client_idx on public.payments (client_id, received_on);

create table if not exists public.payment_allocations (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments (id) on delete restrict,
  document_id   uuid not null references public.documents (id) on delete restrict,
  -- Which line of the document, when the document lists several invoices (a statement).
  line_index    integer,
  amount_cents  bigint not null,
  constraint payment_allocations_amount_check check (amount_cents > 0),
  constraint payment_allocations_line_check check (line_index is null or line_index >= 0)
);

create index if not exists payment_allocations_document_idx on public.payment_allocations (document_id);
create index if not exists payment_allocations_payment_idx on public.payment_allocations (payment_id);

-- Allocations may not exceed the payment.
create or replace function public.payment_allocations_within_payment()
returns trigger
language plpgsql
as $$
declare total bigint; gross bigint;
begin
  select coalesce(sum(amount_cents), 0) into total from public.payment_allocations where payment_id = new.payment_id;
  select amount_cents into gross from public.payments where id = new.payment_id;
  if gross is null then
    raise exception 'no such payment' using errcode = 'foreign_key_violation';
  end if;
  if total > gross then
    raise exception 'allocations (%) exceed the payment (%)', total, gross using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payment_allocations_within on public.payment_allocations;
create trigger trg_payment_allocations_within
  after insert or update on public.payment_allocations
  for each row execute function public.payment_allocations_within_payment();

-- The only change a payment may see: being voided, once, with a reason.
create or replace function public.payments_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'payments are not deleted; void one with a reason' using errcode = 'check_violation';
  end if;
  if old.voided_at is not null then
    raise exception 'this payment was already voided' using errcode = 'check_violation';
  end if;
  if new.voided_at is null or new.void_reason = '' then
    raise exception 'a payment can only be voided, with a reason' using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - 'voided_at' - 'void_reason') is distinct from (to_jsonb(old) - 'voided_at' - 'void_reason') then
    raise exception 'a payment cannot be edited' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_guard on public.payments;
create trigger trg_payments_guard
  before update or delete on public.payments
  for each row execute function public.payments_guard();
drop trigger if exists trg_payments_no_truncate on public.payments;
create trigger trg_payments_no_truncate
  before truncate on public.payments
  for each statement execute function public.payments_guard();

-- Allocations are written once with their payment and never touched.
create or replace function public.payment_allocations_frozen()
returns trigger
language plpgsql
as $$
begin
  raise exception 'payment allocations are written once; void the payment instead' using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_payment_allocations_frozen on public.payment_allocations;
create trigger trg_payment_allocations_frozen
  before update or delete on public.payment_allocations
  for each row execute function public.payment_allocations_frozen();
drop trigger if exists trg_payment_allocations_no_truncate on public.payment_allocations;
create trigger trg_payment_allocations_no_truncate
  before truncate on public.payment_allocations
  for each statement execute function public.payment_allocations_frozen();

alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
revoke all on table public.payments, public.payment_allocations from anon, authenticated, service_role;
grant select, insert, update on table public.payments to service_role;
grant select, insert on table public.payment_allocations to service_role;

comment on table public.payments is 'Money received: date, gross, fee, method, reference. Voided with a reason, never edited. Service-role access only.';
comment on table public.payment_allocations is 'Which document (and line) a payment pays. Written once. Service-role access only.';

commit;
