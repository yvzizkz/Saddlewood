-- Billing registers: change orders and lien waivers (docs/COHESIVE-APP-PLAN.md §6.6 A2, A3, S9).
--
-- Change orders. A change order is a `documents` row (kind change_order) once
-- it is priced and issued, but most of its life comes before that: a
-- directive in the field, a request, a price, a signature, an invoice. SOP-002
-- loses them in between ("verbal, lost"). The register holds each one from
-- the first word to the invoice that bills it:
--
--   requested → priced → sent → signed → billed       (or rejected / void)
--
-- A requested CO is "awaiting price" in the task feed for the owners
-- (decisions), aging from requested_on. Under the minor-extras threshold
-- (policy.extras.coFromCents) it can go straight to billed on the next invoice.
--
-- Lien waivers. Two directions, one register:
--   out  we give the client one with an invoice (AFT: their own conditional
--        form, matching the amount; final with the last bill)
--   in   a sub gives us one with each payment (SOP-004: conditional with every
--        payment, final at closeout)
-- Each row names what it covers (our invoice, or the sub's bill and payment),
-- the amount and the date it runs through, and where it stands.

create table if not exists public.change_orders (
  id                  bigint generated always as identity primary key,
  job_id              uuid references public.jobs (id) on delete set null,
  crew_job_id         text references public.crew_jobs (id) on update cascade on delete set null,
  number              text not null default '',
  title               text not null,
  detail              text not null default '',
  source              text not null default 'request',
  status              text not null default 'requested',
  amount_cents        bigint,
  requested_on        date not null default ((now() at time zone 'America/Phoenix')::date),
  requested_by        text not null default '',
  priced_at           timestamptz,
  priced_by           text not null default '',
  document_id         uuid references public.documents (id) on delete set null,
  signed_on           date,
  billed_document_id  uuid references public.documents (id) on delete set null,
  note                text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint change_orders_status_check check (status in ('requested', 'priced', 'sent', 'signed', 'billed', 'rejected', 'void')),
  constraint change_orders_source_check check (source in ('request', 'directive', 'tm', 'field', 'client')),
  constraint change_orders_amount_check check (amount_cents is null or amount_cents >= 0),
  constraint change_orders_priced_check check (status in ('requested', 'rejected', 'void') or amount_cents is not null),
  constraint change_orders_title_check check (length(btrim(title)) between 1 and 200)
);

create index if not exists change_orders_job_idx on public.change_orders (job_id, status);
create index if not exists change_orders_crew_job_idx on public.change_orders (crew_job_id, status);
create index if not exists change_orders_open_idx on public.change_orders (status, requested_on);

drop trigger if exists trg_change_orders_updated_at on public.change_orders;
create trigger trg_change_orders_updated_at
  before update on public.change_orders
  for each row execute function public.set_updated_at();

create table if not exists public.lien_waivers (
  id               bigint generated always as identity primary key,
  direction        text not null,
  kind             text not null,
  job_id           uuid references public.jobs (id) on delete set null,
  crew_job_id      text references public.crew_jobs (id) on update cascade on delete set null,
  document_id      uuid references public.documents (id) on delete set null,
  bill_id          uuid references public.bills (id) on delete set null,
  bill_payment_id  uuid references public.bill_payments (id) on delete set null,
  party            text not null default '',
  amount_cents     bigint not null,
  through_on       date,
  status           text not null default 'required',
  file_url         text not null default '',
  received_on      date,
  note             text not null default '',
  created_by       text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint lien_waivers_direction_check check (direction in ('out', 'in')),
  constraint lien_waivers_kind_check check (kind in ('conditional_progress', 'unconditional_progress', 'conditional_final', 'unconditional_final')),
  constraint lien_waivers_status_check check (status in ('required', 'prepared', 'sent', 'received', 'void')),
  constraint lien_waivers_amount_check check (amount_cents >= 0),
  -- An outgoing waiver covers our invoice; an incoming one covers a sub's bill.
  constraint lien_waivers_target_check check ((direction = 'out' and document_id is not null) or (direction = 'in' and bill_id is not null))
);

create index if not exists lien_waivers_document_idx on public.lien_waivers (document_id);
create index if not exists lien_waivers_bill_idx on public.lien_waivers (bill_id);
create index if not exists lien_waivers_status_idx on public.lien_waivers (status, direction);

drop trigger if exists trg_lien_waivers_updated_at on public.lien_waivers;
create trigger trg_lien_waivers_updated_at
  before update on public.lien_waivers
  for each row execute function public.set_updated_at();

alter table public.change_orders enable row level security;
alter table public.lien_waivers enable row level security;
revoke all on table public.change_orders, public.lien_waivers from anon, authenticated, service_role;
grant select, insert, update on table public.change_orders, public.lien_waivers to service_role;

comment on table public.change_orders is 'Every change order from the first request to the invoice that bills it (SOP-002). Service-role access only.';
comment on table public.lien_waivers is 'Lien waivers we give with invoices (out) and receive with sub payments (in). Service-role access only.';
