-- Progress payment trackers: the schedule-of-values workbook Marco sends the
-- owners of a residential job (Powell first). One row per job holds the live
-- state as JSON (payments, line items, invoice number, notes); every generated
-- invoice is snapshotted in progress_tracker_invoices so a sent workbook can be
-- reproduced and a mistaken roll-forward stepped back. Service-role only, like
-- the Ops board: the API routes authorize the actor, then write with the admin
-- client. The JSON shape is src/lib/trackers/types.ts (schemaVersion 1) and is
-- shared with the local build_tracker.py in the Powell Progress folder.

create table if not exists public.progress_trackers (
  id            text primary key,
  project_name  text not null,
  invoice_number text not null default '',
  state         jsonb not null,
  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint progress_trackers_id_check check (id ~ '^[a-z0-9][a-z0-9-]*$' and length(id) <= 64)
);

drop trigger if exists trg_progress_trackers_updated_at on public.progress_trackers;
create trigger trg_progress_trackers_updated_at
  before update on public.progress_trackers
  for each row execute function public.set_updated_at();

alter table public.progress_trackers enable row level security;
comment on table public.progress_trackers is 'Live progress-payment tracker state per job (JSON). Service-role access only.';

create table if not exists public.progress_tracker_invoices (
  id             bigserial primary key,
  tracker_id     text not null references public.progress_trackers(id) on delete cascade,
  invoice_number text not null,
  invoice_date   text not null default '',
  total_due      numeric(14,2) not null default 0,
  status         text not null default 'issued',
  state          jsonb not null,
  generated_by   text,
  sent_to        text,
  email_id       text,
  created_at     timestamptz not null default now(),
  constraint progress_tracker_invoices_status_check check (status in ('issued', 'superseded')),
  constraint progress_tracker_invoices_unique unique (tracker_id, invoice_number)
);

create index if not exists progress_tracker_invoices_tracker_idx on public.progress_tracker_invoices (tracker_id, created_at desc);
alter table public.progress_tracker_invoices enable row level security;
comment on table public.progress_tracker_invoices is 'Snapshot of a tracker at each generated invoice, with where the workbook was emailed. Service-role access only.';

-- Seed: the Powell residence as of invoice #3526-09 (09/09/2026), after the
-- $35,500 payment on #3526-08. Idempotent.
insert into public.progress_trackers (id, project_name, invoice_number, state, updated_by)
values ('powell', 'Powell Residence', '3526-09', '{"schemaVersion":1,"project":{"name":"Powell Residence","contractor":"Saddlewood Contracting LLC","owners":"Mark & Heather Powell","address":"3526 Emerson St, San Diego CA 92106","invoicePrefix":"3526"},"invoice":{"number":"3526-09","date":"09/09/2026","status":"draft"},"previousInvoice":{"number":"3526-08","total":35500,"paidDate":"__/__/2026","items":[{"name":"Kitchen","amount":19000,"kind":"progress"},{"name":"Guest Bath","amount":6500,"kind":"progress"},{"name":"Laundry Room","amount":5000,"kind":"progress"},{"name":"Painting & Baseboards","amount":5000,"kind":"progress"}],"paid":35500},"payments":[{"label":"Check #253","date":"04/30/2026","amount":50000},{"label":"Check #258","date":"05/21/2026","amount":60000},{"label":"Owner Draw (ref. ________)","date":"05/31/2026","amount":90000},{"label":"Owner Payment (ref. ________)","date":"06/16/2026","amount":73109.58},{"label":"Owner Payment (ref. ________)","date":"07/01/2026","amount":65000},{"label":"Owner Payment (ref. ________) — Inv #3526-05","date":"07/16/2026","amount":29800},{"label":"Owner Deposit (ref. ________) — Inv #3526-06","date":"07/28/2026","amount":57426.72},{"label":"Owner Payment (ref. ________) — Inv #3526-07","date":"08/14/2026","amount":30000},{"label":"Owner Payment (ref. ________) — Inv #3526-08","date":"__/__/2026","amount":35500}],"lines":[{"id":"crawl-space","name":"Crawl Space","contract":15015,"changeOrder":0,"completedPrior":10000,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"attic","name":"Attic","contract":0,"changeOrder":0,"completedPrior":0,"thisInvoice":0,"draw":0,"tbd":true,"note":""},{"id":"roof-skylights","name":"Roof & Skylights","contract":0,"changeOrder":0,"completedPrior":0,"thisInvoice":0,"draw":0,"tbd":true,"note":""},{"id":"roof-repairs","name":"Roof Repairs","contract":0,"changeOrder":6000,"completedPrior":6000,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"interior-walls","name":"Interior Walls & Framing","contract":0,"changeOrder":14368.5,"completedPrior":14368.5,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"ceiling-framing","name":"Ceiling Heights & Framing","contract":0,"changeOrder":0,"completedPrior":0,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"hvac-registers","name":"HVAC — A/C Registers (CO)","contract":0,"changeOrder":2500,"completedPrior":2500,"thisInvoice":0,"draw":0,"tbd":false,"note":"   [A/C registers labor & materials — balance of HVAC scope still TBD]"},{"id":"stucco","name":"Stucco","contract":27300,"changeOrder":10000,"completedPrior":37300,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"kitchen","name":"Kitchen","contract":89512,"changeOrder":0,"completedPrior":39000,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"primary-bath","name":"Primary Bath","contract":62055,"changeOrder":0,"completedPrior":22000,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"guest-bath","name":"Guest Bath","contract":31500,"changeOrder":0,"completedPrior":16500,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"powder-room","name":"Powder Room","contract":13492,"changeOrder":0,"completedPrior":0,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"laundry","name":"Laundry Room","contract":23572,"changeOrder":0,"completedPrior":10000,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"closets-office","name":"Closets & Mark''s Office","contract":41737,"changeOrder":0,"completedPrior":15000,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"fireplaces","name":"Fireplaces","contract":28087,"changeOrder":0,"completedPrior":0,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"doors","name":"Doors","contract":14752,"changeOrder":11500,"completedPrior":23841.08,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"flooring","name":"Flooring","contract":45675,"changeOrder":21251.72,"completedPrior":66926.72,"thisInvoice":0,"draw":0,"tbd":false,"note":"   [labor $45,675 + material CO $21,251.72 — billed in full, paid]"},{"id":"electrical","name":"Electrical (Whole House)","contract":105000,"changeOrder":-15000,"completedPrior":79000,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"plumbing","name":"Plumbing (Whole House)","contract":94500,"changeOrder":-24500,"completedPrior":46800,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"insulation","name":"Insulation","contract":0,"changeOrder":13600,"completedPrior":13600,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"drywall","name":"Drywall","contract":49350,"changeOrder":-2100,"completedPrior":46000,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"painting","name":"Painting & Baseboards","contract":49087,"changeOrder":0,"completedPrior":42000,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"rear-deck","name":"Rear Deck","contract":0,"changeOrder":0,"completedPrior":0,"thisInvoice":0,"draw":0,"tbd":true,"note":""},{"id":"final-clean","name":"Final Clean","contract":3675,"changeOrder":0,"completedPrior":0,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"contingency","name":"Contingency","contract":35280,"changeOrder":0,"completedPrior":0,"thisInvoice":0,"draw":0,"tbd":false,"note":""},{"id":"overhead","name":"Overhead 15%","contract":0,"changeOrder":0,"completedPrior":0,"thisInvoice":0,"draw":0,"tbd":true,"note":""}],"pendingChangeOrders":["double-layer perimeter walls","rear deck","block walls","landscape"],"notes":{"mode":"auto","text":""},"meta":{"updatedAt":"2026-09-09T20:30:00-07:00","updatedBy":"claude-code roll-forward (review fixes)"}}'::jsonb, 'migration-0008')
on conflict (id) do nothing;
