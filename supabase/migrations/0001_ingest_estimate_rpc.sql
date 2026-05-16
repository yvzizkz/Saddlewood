-- ============================================================================
-- ingest_estimate(payload jsonb) — atomic ingest RPC
-- Phase 2 §10 + Gap 4 (re-ingest versioning)
--
-- Behavior:
--   1. Upsert the job row on (name, coalesce(address,'')) — partial unique idx.
--   2. Find the most recent non-archived estimate for this job (if any).
--      - First estimate         → version=1, parent=null,  isRevision=false.
--      - Prior active estimate  → version=prior+1, parent=prior.id, archive prior.
--      - Only archived priors   → version=max(version)+1, parent=null,
--                                  isRevision=true (resumes after archive).
--   3. Insert the new estimates row with ingest_hash / pipeline_version.
--   4. Insert estimate_trades rows (sort_order = payload index if not given).
--   5. Bulk-insert estimate_line_items per trade with frozen ai_baseline_snapshot.
--   6. Return { estimateId, jobId, version, isRevision, previousEstimateId }.
--
-- All inside one implicit Postgres transaction — any error rolls back fully.
-- SECURITY DEFINER → runs as function owner, bypasses RLS.
-- ============================================================================

create or replace function public.ingest_estimate(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job_id              uuid;
  v_estimate_id         uuid;
  v_trade_id            uuid;
  v_version             int;
  v_max_version         int;
  v_parent_id           uuid;
  v_is_revision         boolean := false;
  v_trade               jsonb;
  v_trade_idx           int := 0;
  v_ingest_hash         text;
begin
  v_ingest_hash := payload->>'ingest_hash';

  -- ── 1. Upsert job ────────────────────────────────────────────────────────
  insert into public.jobs (
    name, client_name, address, ahj, bid_due_date,
    project_type, gc_name, client_email, client_phone
  )
  values (
    payload->'job'->>'name',
    payload->'job'->>'client_name',
    payload->'job'->>'address',
    payload->'job'->>'ahj',
    nullif(payload->'job'->>'bid_due_date', '')::date,
    payload->'job'->>'project_type',
    payload->'job'->>'gc_name',
    payload->'job'->>'client_email',
    payload->'job'->>'client_phone'
  )
  on conflict (name, coalesce(address, '')) do update
    set client_name  = coalesce(excluded.client_name,  public.jobs.client_name),
        ahj          = coalesce(excluded.ahj,          public.jobs.ahj),
        bid_due_date = coalesce(excluded.bid_due_date, public.jobs.bid_due_date),
        project_type = coalesce(excluded.project_type, public.jobs.project_type),
        gc_name      = coalesce(excluded.gc_name,      public.jobs.gc_name),
        client_email = coalesce(excluded.client_email, public.jobs.client_email),
        client_phone = coalesce(excluded.client_phone, public.jobs.client_phone),
        updated_at   = now()
  returning id into v_job_id;

  -- ── 2. Version detection (Gap 4) ─────────────────────────────────────────
  select id, version
    into v_parent_id, v_version
  from public.estimates
  where job_id = v_job_id
    and review_status <> 'archived'
  order by version desc
  limit 1;

  if v_version is null then
    -- No active prior. Check if archived priors exist to compute next version.
    select max(version) into v_max_version from public.estimates where job_id = v_job_id;
    if v_max_version is null then
      v_version := 1;
      v_is_revision := false;
    else
      v_version := v_max_version + 1;
      v_is_revision := true;
    end if;
    v_parent_id := null;
  else
    -- Archive the prior active estimate; new version supersedes it.
    update public.estimates
       set review_status = 'archived'
     where id = v_parent_id;
    v_version := v_version + 1;
    v_is_revision := true;
  end if;

  -- ── 3. Insert estimate ───────────────────────────────────────────────────
  insert into public.estimates (
    job_id, version, parent_estimate_id, is_ai_baseline, review_status,
    ingest_hash, pipeline_version, ingested_at,
    overhead_pct, profit_pct, contingency_pct, gc_sub_markup_pct
  ) values (
    v_job_id, v_version, v_parent_id, true, 'draft',
    v_ingest_hash, payload->>'pipeline_version', now(),
    (payload->'config'->>'overhead_pct')::numeric,
    (payload->'config'->>'profit_pct')::numeric,
    (payload->'config'->>'contingency_pct')::numeric,
    (payload->'config'->>'gc_sub_markup_pct')::numeric
  )
  returning id into v_estimate_id;

  -- ── 4 + 5. Insert trades and their line items ───────────────────────────
  for v_trade in select * from jsonb_array_elements(payload->'trades') loop
    insert into public.estimate_trades (
      estimate_id, trade_name, trade_status, sort_order
    ) values (
      v_estimate_id,
      v_trade->>'trade_name',
      v_trade->>'trade_status',
      coalesce((v_trade->>'sort_order')::int, v_trade_idx)
    )
    returning id into v_trade_id;

    insert into public.estimate_line_items (
      trade_id, description, area_location, quantity, unit,
      material_unit_cost, labor_unit_cost, labor_hours_per_unit,
      dimension_type, source_sheet, source_grid, confidence,
      flags, is_allowance, is_deleted, is_manual_override,
      ai_baseline_snapshot, sort_order
    )
    select
      v_trade_id,
      item->>'description',
      item->>'area_location',
      (item->>'quantity')::numeric,
      item->>'unit',
      (item->>'material_unit_cost')::numeric,
      (item->>'labor_unit_cost')::numeric,
      nullif(item->>'labor_hours_per_unit', 'null')::numeric,
      item->>'dimension_type',
      item->>'source_sheet',
      item->>'source_grid',
      item->>'confidence',
      coalesce(
        array(select jsonb_array_elements_text(coalesce(item->'flags', '[]'::jsonb))),
        array[]::text[]
      ),
      coalesce((item->>'is_allowance')::boolean, false),
      false,
      false,
      jsonb_build_object(
        'quantity',             (item->>'quantity')::numeric,
        'material_unit_cost',   (item->>'material_unit_cost')::numeric,
        'labor_unit_cost',      (item->>'labor_unit_cost')::numeric,
        'labor_hours_per_unit', nullif(item->>'labor_hours_per_unit', 'null')::numeric,
        'confidence',           item->>'confidence',
        'flags',                coalesce(item->'flags', '[]'::jsonb),
        'dimension_type',       item->>'dimension_type'
      ),
      (ord - 1)::int
    from jsonb_array_elements(v_trade->'line_items') with ordinality as la(item, ord);

    v_trade_idx := v_trade_idx + 1;
  end loop;

  return jsonb_build_object(
    'estimateId',          v_estimate_id,
    'jobId',               v_job_id,
    'version',             v_version,
    'isRevision',          v_is_revision,
    'previousEstimateId',  v_parent_id
  );
end;
$$;

-- Grant execute to authenticated role (route handler uses service role anyway,
-- but granting authenticated lets server-side admin work even if key style changes).
grant execute on function public.ingest_estimate(jsonb) to service_role;
