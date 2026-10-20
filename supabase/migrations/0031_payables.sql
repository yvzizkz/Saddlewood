-- Accounts Payable (`bills` and `bill_payments`, T11, docs/COHESIVE-APP-PLAN.md §3).
--
-- Tracks vendor invoices, subcontractor progress bills against awarded bid packages,
-- crew out-of-pocket reimbursements, and Melio / check / ACH / Zelle payments out.
-- Connects every payable to its vendor/sub (`subs`), job (`jobs` / `crew_jobs`),
-- trade (`trades`), awarded bid package (`bid_packages`), and purchase trip (`purchases.trip_key`).
--
-- Additive only. Service-role access only, matching the rest of the portal.

begin;

create table if not exists public.bills (
  id                 uuid primary key default gen_random_uuid(),
  bill_number        text not null,
  kind               text not null default 'sub',
  vendor_name        text not null,
  sub_id             uuid references public.subs (id) on delete set null,
  job_id             uuid references public.jobs (id) on delete set null,
  crew_job_id        text references public.crew_jobs (id) on update cascade on delete set null,
  bid_package_id     uuid references public.bid_packages (id) on delete set null,
  purchase_trip_key  text,
  trade              text not null default 'general' references public.trades (slug) on update cascade,
  description        text not null default '',
  -- [{description, trade, qty, unitCents, totalCents}]
  lines              jsonb not null default '[]'::jsonb,
  issued_on          date not null,
  due_on             date,
  amount_cents       bigint not null,
  retainage_cents    bigint not null default 0,
  status             text not null default 'open',
  waiver_status      text not null default 'not_required',
  payment_terms      text not null default 'friday_run',
  approved_by        text not null default '',
  approved_at        timestamptz,
  void_reason        text not null default '',
  voided_at          timestamptz,
  note               text not null default '',
  created_by         text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint bills_kind_check check (kind in ('sub', 'vendor', 'reimbursement', 'rental', 'utility')),
  constraint bills_amount_check check (amount_cents >= 0),
  constraint bills_retainage_check check (retainage_cents >= 0 and retainage_cents <= amount_cents),
  constraint bills_status_check check (
    status in ('draft', 'needs_approval', 'hold_waiver', 'hold_coi', 'open', 'scheduled', 'partial', 'paid', 'disputed', 'void')
  ),
  constraint bills_waiver_check check (
    waiver_status in ('not_required', 'missing', 'conditional_received', 'final_received')
  ),
  constraint bills_terms_check check (
    payment_terms in ('friday_run', 'pay_when_paid', 'net_15', 'net_30', 'due_on_receipt')
  )
);

create unique index if not exists bills_vendor_number_uidx
  on public.bills (lower(vendor_name), bill_number);
create index if not exists bills_job_idx on public.bills (job_id, issued_on desc);
create index if not exists bills_crew_job_idx on public.bills (crew_job_id, issued_on desc);
create index if not exists bills_sub_idx on public.bills (sub_id, issued_on desc);
create index if not exists bills_trade_idx on public.bills (trade, issued_on desc);
create index if not exists bills_due_idx on public.bills (due_on, status);

drop trigger if exists trg_bills_updated_at on public.bills;
create trigger trg_bills_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();

create table if not exists public.bill_payments (
  id                uuid primary key default gen_random_uuid(),
  bill_id           uuid not null references public.bills (id) on delete restrict,
  paid_on           date not null,
  amount_cents      bigint not null,
  fee_cents         bigint not null default 0,
  method            text not null,
  reference         text not null default '',
  waiver_collected  boolean not null default false,
  recorded_by       text not null default '',
  recorded_at       timestamptz not null default now(),
  voided_at         timestamptz,
  void_reason       text not null default '',
  note              text not null default '',
  constraint bill_payments_amount_check check (amount_cents > 0),
  constraint bill_payments_fee_check check (fee_cents >= 0 and fee_cents < amount_cents),
  constraint bill_payments_method_check check (
    method in ('melio', 'check', 'ach', 'wire', 'zelle', 'card', 'cash', 'other')
  ),
  constraint bill_payments_void_check check (voided_at is null or void_reason <> '')
);

create index if not exists bill_payments_bill_idx on public.bill_payments (bill_id, paid_on desc);
create index if not exists bill_payments_paid_on_idx on public.bill_payments (paid_on desc);

alter table public.bills enable row level security;
alter table public.bill_payments enable row level security;

revoke all on table public.bills, public.bill_payments from anon, authenticated, service_role;
grant select, insert, update on table public.bills, public.bill_payments to service_role;

comment on table public.bills is 'Accounts payable: subcontractor progress bills, vendor invoices, rentals and crew reimbursements. Service-role access only.';
comment on table public.bill_payments is 'Payments out against AP bills (Melio, check, ACH, wire, Zelle, card). Service-role access only.';

commit;
