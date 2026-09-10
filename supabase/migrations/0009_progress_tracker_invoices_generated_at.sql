-- When a snapshot was last (re)generated. The upsert on (tracker_id, invoice_number)
-- keeps created_at from the first generation; History shows this column instead.
alter table public.progress_tracker_invoices
  add column if not exists generated_at timestamptz not null default now();
