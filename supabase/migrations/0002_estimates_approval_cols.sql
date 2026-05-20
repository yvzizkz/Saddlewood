-- ============================================================================
-- Migration 0002: Add approval tracking columns to estimates
-- ----------------------------------------------------------------------------
-- Required by Phase 3 (Marco mobile UI) — PATCH /api/estimates/[id] writes
-- approved_by + approved_at when Marco taps "Approve & Send" so we have a
-- forensics trail of who/when, independent of the email_log.
--
-- Idempotent: safe to re-run.
-- ============================================================================

alter table public.estimates
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

-- Index for "show me approved estimates by user" queries (Phase 8 analytics)
create index if not exists estimates_approved_by_idx
  on public.estimates (approved_by)
  where approved_by is not null;
