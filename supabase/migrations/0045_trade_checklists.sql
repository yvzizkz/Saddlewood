-- Field checklists per trade (K12). Saddlewood is a GC (ROC 305762) with its
-- own CR-11 electrical, CR-37 plumbing and CR-39 AC & refrigeration licenses,
-- so plumbing, electrical and HVAC get their own inspection checklists next to
-- the drywall sequence 0035 made: rough-in, pre-cover and final for each.
--
-- Additive only: the stage check is widened to allow the new stages. No row is
-- read, changed or deleted, and every existing stage stays valid.
--
-- The trade list itself needs nothing: 0029_trades already seeds plumbing,
-- electrical and hvac.

begin;

alter table public.checklists drop constraint if exists checklists_stage_check;
alter table public.checklists add constraint checklists_stage_check check (
  stage in (
    'pre_cover', 'pre_board', 'pre_tape', 'pre_texture', 'pre_paint', 'final_walk',
    'plumbing_rough', 'plumbing_precover', 'plumbing_final',
    'electrical_rough', 'electrical_precover', 'electrical_final',
    'hvac_rough', 'hvac_precover', 'hvac_final'
  )
);

commit;
