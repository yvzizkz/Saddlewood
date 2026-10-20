-- Synthetic cohesive seed (T5 / docs/COHESIVE-APP-PLAN.md §6, docs/KB-OPERATIONS-MODEL.md).
--
-- SAFETY: 100% synthetic contact info (@example.com, 555-01xx). Patterned on
-- Saddlewood's real operational distributions from the KB:
--   * AFT Construction (23rd cutoff, conditional waiver required, Melio 1% fee)
--   * Schifferer Built (20th cutoff, Built portal, 10% retainage, pay-when-paid 10d)
--   * Powell & homeowner jobs (1st/15th or biweekly SOV draws, 7-day net terms)
--   * Crew shifts across Today, WTD, MTD, YTD (and prior periods) with trades & rates
--   * Purchases across Home Depot, Sherwin-Williams, AZ Building Supply, Sunbelt Rentals
--     across Today, WTD, MTD, YTD + unmatched register aliases ("Which job is this?")
--   * Subs, bid packages, AP bills (`bills`) & AP payments (`bill_payments`)
--   * AR invoices, change orders, statements, proof events, and payments (`payments`)
--
-- Idempotent: can be re-run safely against the local Supabase stack.

begin;

-- ---------------------------------------------------------------------------
-- 0. Ensure owner seats exist in bot_state so local dev sessions have owner access
-- ---------------------------------------------------------------------------
insert into public.bot_state (key, data, updated_at)
values (
  'people',
  '{
    "owner.test@example.com": {"name": "Lando (Test)", "role": "owner"},
    "lando@saddlewoodcontracting.com": {"name": "Lando", "role": "owner"},
    "marco@saddlewoodcontracting.com": {"name": "Marco", "role": "owner"},
    "ilene8a@gmail.com": {"name": "Ilene", "role": "owner"},
    "info@saddlewoodcontracting.com": {"name": "Saddlewood Office", "role": "owner"}
  }'::jsonb,
  now()
)
on conflict (key) do update
  set data = public.bot_state.data || excluded.data,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 1. Clients & Contacts (synthetic emails/phones, KB-accurate billing profiles)
-- ---------------------------------------------------------------------------
insert into public.clients (id, name, kind, billing, note, created_by)
values
  (
    'c0000001-0000-4000-8000-000000000001',
    'A Finer Touch Construction (Synthetic)',
    'gc',
    '{"delivery": "email", "cutoffDay": 23, "netDays": 30, "paymentMethod": "melio", "attachments": ["conditional_waiver"], "note": "Billing closes on the 23rd. Every invoice requires a signed AFT Conditional Progress Waiver matching the exact amount. Pays via Melio (1% fee)."}'::jsonb,
    'Synthetic GC patterned on AFT Construction (jobs 8009, 5203, 4125).',
    'seed-cohesive'
  ),
  (
    'c0000001-0000-4000-8000-000000000002',
    'Schifferer Built LLC (Synthetic)',
    'gc',
    '{"delivery": "portal", "portalName": "Built", "cutoffDay": 20, "payWhenPaidDays": 10, "retainagePct": 10, "attachments": ["conditional_waiver"], "note": "Upload pay apps to Built portal by the 20th. 10% retainage; paid within 10 days after GC draw."}'::jsonb,
    'Synthetic GC patterned on Schifferer Built (Bellevue AC938, prefix 9146).',
    'seed-cohesive'
  ),
  (
    'c0000001-0000-4000-8000-000000000003',
    'Mark & Heather Powell (Synthetic)',
    'homeowner',
    '{"delivery": "email", "netDays": 7, "paymentMethod": "check", "attachments": ["tracker_workbook"], "note": "Biweekly SOV progress tracker workbook attached with each draw."}'::jsonb,
    'Synthetic homeowner patterned on 3526 Emerson Street.',
    'seed-cohesive'
  ),
  (
    'c0000001-0000-4000-8000-000000000004',
    'Leila Woodward (Synthetic)',
    'homeowner',
    '{"delivery": "email", "netDays": 7, "cutoffDay": 15, "paymentMethod": "wire", "attachments": []}'::jsonb,
    'Synthetic homeowner patterned on 6402 E Bambi Drive.',
    'seed-cohesive'
  ),
  (
    'c0000001-0000-4000-8000-000000000005',
    'Lindsay McHugh (Synthetic)',
    'homeowner',
    '{"delivery": "email", "netDays": 7, "paymentMethod": "check", "attachments": []}'::jsonb,
    'Synthetic homeowner patterned on 12729 W Keim Dr.',
    'seed-cohesive'
  ),
  (
    'c0000001-0000-4000-8000-000000000006',
    'Allen Porter (Synthetic)',
    'homeowner',
    '{"delivery": "email", "netDays": 7, "paymentMethod": "check", "attachments": []}'::jsonb,
    'Synthetic homeowner patterned on 4055 N Recker Rd.',
    'seed-cohesive'
  )
on conflict (id) do update
  set billing = excluded.billing,
      note = excluded.note,
      updated_at = now();

delete from public.client_contacts
 where client_id in (
   'c0000001-0000-4000-8000-000000000001',
   'c0000001-0000-4000-8000-000000000002',
   'c0000001-0000-4000-8000-000000000003',
   'c0000001-0000-4000-8000-000000000004',
   'c0000001-0000-4000-8000-000000000005',
   'c0000001-0000-4000-8000-000000000006'
 );

insert into public.client_contacts (client_id, name, email, phone, role)
values
  ('c0000001-0000-4000-8000-000000000001', 'Vanessa Winters (Synthetic AP)', 'ap.aft@example.com', '555-0101', 'ap'),
  ('c0000001-0000-4000-8000-000000000001', 'Chris Caldwell (Synthetic PM)', 'pm.aft@example.com', '555-0102', 'pm'),
  ('c0000001-0000-4000-8000-000000000002', 'Dean Schifferer (Synthetic)', 'dean.schifferer@example.com', '555-0103', 'principal'),
  ('c0000001-0000-4000-8000-000000000002', 'Built Portal AP (Synthetic)', 'ap.schifferer@example.com', '555-0104', 'ap'),
  ('c0000001-0000-4000-8000-000000000003', 'Mark Powell (Synthetic)', 'mark.powell@example.com', '555-0105', 'principal'),
  ('c0000001-0000-4000-8000-000000000004', 'Leila Woodward (Synthetic)', 'leila.woodward@example.com', '555-0106', 'principal'),
  ('c0000001-0000-4000-8000-000000000005', 'Lindsay McHugh (Synthetic)', 'lindsay.mchugh@example.com', '555-0107', 'principal'),
  ('c0000001-0000-4000-8000-000000000006', 'Allen Porter (Synthetic)', 'allen.porter@example.com', '555-0108', 'principal');

-- ---------------------------------------------------------------------------
-- 2. Field Jobs (`crew_jobs`) & Billing Jobs (`jobs`) linked 1:1
-- ---------------------------------------------------------------------------
insert into public.crew_jobs (id, name, address, note, active, created_by, promised, promise_note)
values
  ('8009-n-ironwood-dr', '8009 N Ironwood Dr (Jury AFT 123)', '8009 N Ironwood Dr, Paradise Valley, AZ 85253', 'Gate code #4412. AFT 123 custom remodel framing & Level 5 drywall.', true, 'seed-cohesive', current_date + 10, 'Complete theater soffit & Level 5 skim before cabinet install'),
  ('5203-n-monte-vista', '5203 N Monte Vista Dr (Peter Rabbit AFT 125)', '5203 N Monte Vista Dr, Scottsdale, AZ 85253', 'AFT 125 main house + casita finish & punch.', true, 'seed-cohesive', current_date + 5, 'Final punch walkthrough with AFT super'),
  ('4125-e-camelback-rd', '4125 E Camelback Rd (Carder AFT 129)', '4125 E Camelback Rd, Phoenix, AZ 85018', 'AFT 129 framing & drywall package.', true, 'seed-cohesive', current_date + 21, 'Rough framing inspection'),
  ('9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', '9440 W Hutton Dr, Sun City, AZ 85351', 'Bellevue Heights Church AC938 — metal stud framing, insulation, abuse-resistant drywall, ChamClad.', true, 'seed-cohesive', current_date + 14, 'Franklin Hall 2-hr rated shaft wall & classroom hang'),
  ('3526-emerson-street', '3526 Emerson Street (Powell)', '3526 E Emerson St, Scottsdale, AZ 85251', 'Powell residence whole-home renovation & addition.', true, 'seed-cohesive', current_date + 7, 'Biweekly SOV draw #9 walkthrough'),
  ('6402-e-bambi-drive', '6402 E Bambi Drive (Woodward)', '6402 E Bambi Dr, Mesa, AZ 85215', 'Woodward framing, drywall hang/tape/texture, interior paint.', true, 'seed-cohesive', current_date + 4, 'Drywall texture & prime complete'),
  ('12729-w-keim-dr', '12729 W Keim Dr (McHugh)', '12729 W Keim Dr, Litchfield Park, AZ 85340', 'McHugh custom framing & drywall.', true, 'seed-cohesive', current_date + 18, 'Exterior patio lid framing')
on conflict (id) do update
  set name = excluded.name,
      address = excluded.address,
      note = excluded.note,
      promised = excluded.promised,
      promise_note = excluded.promise_note,
      updated_at = now();

insert into public.jobs (
  id, name, client_name, address, project_type, gc_name, client_email, client_phone,
  status, client_id, crew_job_id, tracker_id, number_prefix, billing
)
values
  (
    'b0000001-0000-4000-8000-000000008009',
    '8009 N Ironwood Dr (Jury AFT 123)',
    'A Finer Touch Construction (Synthetic)',
    '8009 N Ironwood Dr, Paradise Valley, AZ 85253',
    'remodel',
    'A Finer Touch Construction',
    'ap.aft@example.com',
    '555-0101',
    'active',
    'c0000001-0000-4000-8000-000000000001',
    '8009-n-ironwood-dr',
    null,
    '8009',
    '{
      "contractCents": 24850000,
      "cutoffDay": 23,
      "sov": [
        {"id": "framing", "label": "Structural & Steel Stud Framing", "cents": 11200000, "billedPct": 85},
        {"id": "insulation", "label": "Thermal & Sound Batt Insulation", "cents": 2450000, "billedPct": 80},
        {"id": "drywall", "label": "Level 5 Drywall Hang, Tape & Skim", "cents": 11200000, "billedPct": 65}
      ]
    }'::jsonb
  ),
  (
    'b0000001-0000-4000-8000-000000005203',
    '5203 N Monte Vista Dr (Peter Rabbit AFT 125)',
    'A Finer Touch Construction (Synthetic)',
    '5203 N Monte Vista Dr, Scottsdale, AZ 85253',
    'remodel',
    'A Finer Touch Construction',
    'ap.aft@example.com',
    '555-0101',
    'active',
    'c0000001-0000-4000-8000-000000000001',
    '5203-n-monte-vista',
    null,
    '5203',
    '{
      "contractCents": 18600000,
      "cutoffDay": 23,
      "sov": [
        {"id": "framing", "label": "Wood Framing & Backing", "cents": 8400000, "billedPct": 100},
        {"id": "drywall", "label": "Drywall & Smooth Finish", "cents": 7200000, "billedPct": 100},
        {"id": "finish", "label": "Trim, Doors & Cleanup", "cents": 3000000, "billedPct": 90}
      ]
    }'::jsonb
  ),
  (
    'b0000001-0000-4000-8000-000000004125',
    '4125 E Camelback Rd (Carder AFT 129)',
    'A Finer Touch Construction (Synthetic)',
    '4125 E Camelback Rd, Phoenix, AZ 85018',
    'remodel',
    'A Finer Touch Construction',
    'ap.aft@example.com',
    '555-0101',
    'active',
    'c0000001-0000-4000-8000-000000000001',
    '4125-e-camelback-rd',
    null,
    '4125',
    '{
      "contractCents": 9420000,
      "cutoffDay": 23,
      "sov": [
        {"id": "demo", "label": "Selective Demo & Framing", "cents": 5220000, "billedPct": 50},
        {"id": "drywall", "label": "Drywall Assembly", "cents": 4200000, "billedPct": 25}
      ]
    }'::jsonb
  ),
  (
    'b0000001-0000-4000-8000-000000009146',
    '9146 W Hutton Dr (Bellevue AC938)',
    'Schifferer Built LLC (Synthetic)',
    '9440 W Hutton Dr, Sun City, AZ 85351',
    'commercial_ti',
    'Schifferer Built LLC',
    'ap.schifferer@example.com',
    '555-0104',
    'active',
    'c0000001-0000-4000-8000-000000000002',
    '9146-w-hutton-dr',
    null,
    '9146',
    '{
      "contractCents": 31200000,
      "retainagePct": 10,
      "payWhenPaidDays": 10,
      "cutoffDay": 20,
      "sov": [
        {"id": "metal-framing", "label": "Commercial Metal Stud Framing & Soffits", "cents": 13800000, "billedPct": 55},
        {"id": "insulation", "label": "Acoustic & Thermal Batt Insulation", "cents": 3600000, "billedPct": 40},
        {"id": "drywall", "label": "5/8 Type X & Abuse-Resistant GWB", "cents": 10800000, "billedPct": 30},
        {"id": "chamclad", "label": "ChamClad Soffit Panel Install (Labor)", "cents": 3000000, "billedPct": 15}
      ]
    }'::jsonb
  ),
  (
    'b0000001-0000-4000-8000-000000003526',
    '3526 Emerson Street (Powell)',
    'Mark & Heather Powell (Synthetic)',
    '3526 E Emerson St, Scottsdale, AZ 85251',
    'remodel',
    null,
    'mark.powell@example.com',
    '555-0105',
    'active',
    'c0000001-0000-4000-8000-000000000003',
    '3526-emerson-street',
    'powell',
    '3526',
    '{
      "contractCents": 42000000,
      "sov": [
        {"id": "framing", "label": "Main Residence & Casita Framing", "cents": 16500000, "billedPct": 90},
        {"id": "drywall", "label": "Drywall Hang, Tape & Level 4 Finish", "cents": 12500000, "billedPct": 75},
        {"id": "finish", "label": "Interior Trim, Doors & Paint", "cents": 8500000, "billedPct": 45},
        {"id": "tile", "label": "Primary Bath & Flooring", "cents": 4500000, "billedPct": 40}
      ]
    }'::jsonb
  ),
  (
    'b0000001-0000-4000-8000-000000006402',
    '6402 E Bambi Drive (Woodward)',
    'Leila Woodward (Synthetic)',
    '6402 E Bambi Dr, Mesa, AZ 85215',
    'remodel',
    null,
    'leila.woodward@example.com',
    '555-0106',
    'active',
    'c0000001-0000-4000-8000-000000000004',
    '6402-e-bambi-drive',
    null,
    '6402',
    '{
      "contractCents": 13817300,
      "sov": [
        {"id": "framing", "label": "Addition & Interior Framing", "cents": 5647300, "billedPct": 100},
        {"id": "drywall", "label": "Drywall & Texture", "cents": 4800000, "billedPct": 60},
        {"id": "paint", "label": "Interior & Exterior Paint", "cents": 3370000, "billedPct": 20}
      ]
    }'::jsonb
  ),
  (
    'b0000001-0000-4000-8000-000000012729',
    '12729 W Keim Dr (McHugh)',
    'Lindsay McHugh (Synthetic)',
    '12729 W Keim Dr, Litchfield Park, AZ 85340',
    'custom_home',
    null,
    'lindsay.mchugh@example.com',
    '555-0107',
    'active',
    'c0000001-0000-4000-8000-000000000005',
    '12729-w-keim-dr',
    null,
    '12729',
    '{
      "contractCents": 16480000,
      "sov": [
        {"id": "framing", "label": "Custom Home Structural Framing", "cents": 9880000, "billedPct": 85},
        {"id": "drywall", "label": "Whole-House Drywall", "cents": 6600000, "billedPct": 50}
      ]
    }'::jsonb
  )
on conflict (id) do update
  set name = excluded.name,
      client_name = excluded.client_name,
      address = excluded.address,
      client_id = excluded.client_id,
      crew_job_id = excluded.crew_job_id,
      tracker_id = excluded.tracker_id,
      number_prefix = excluded.number_prefix,
      billing = excluded.billing,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Crew People, Job Assignments & Phases
-- ---------------------------------------------------------------------------
insert into public.crew_people (email, name, lang, phone, trade, active, group_id, pay_rate, added_by)
values
  ('eli.pm@example.com', 'Eli Ramirez (PM)', 'en', '555-0110', 'general', true, 'pm', 45.00, 'seed-cohesive'),
  ('tacho.framing@example.com', 'Mateo "Tacho" Mujica', 'es', '555-0111', 'framing', true, 'lead', 38.00, 'seed-cohesive'),
  ('arnold.framing@example.com', 'Arnoldo Mujica', 'es', '555-0112', 'framing', true, 'crew', 32.00, 'seed-cohesive'),
  ('filiberto.framing@example.com', 'Filiberto Villegas', 'es', '555-0113', 'framing', true, 'crew', 30.00, 'seed-cohesive'),
  ('david.drywall@example.com', 'David Morales', 'en', '555-0114', 'drywall', true, 'lead', 36.00, 'seed-cohesive'),
  ('juan.drywall@example.com', 'Juan Torres', 'es', '555-0115', 'drywall', true, 'crew', 31.00, 'seed-cohesive'),
  ('carlos.drywall@example.com', 'Carlos Habana', 'es', '555-0116', 'drywall', true, 'crew', 29.50, 'seed-cohesive'),
  ('jesus.paint@example.com', 'Jesus Mendoza', 'es', '555-0117', 'paint', true, 'crew', 28.00, 'seed-cohesive'),
  ('cesar.finish@example.com', 'Cesar Olivares', 'es', '555-0118', 'finish-carpentry', true, 'crew', 34.00, 'seed-cohesive'),
  ('omar.runner@example.com', 'Omar Pena', 'es', '555-0119', 'general', true, 'runner', 25.00, 'seed-cohesive')
on conflict (email) do update
  set name = excluded.name,
      trade = excluded.trade,
      group_id = excluded.group_id,
      pay_rate = excluded.pay_rate,
      active = true,
      updated_at = now();

insert into public.crew_job_people (job_id, email, role, created_by)
values
  ('8009-n-ironwood-dr', 'eli.pm@example.com', 'pm', 'seed-cohesive'),
  ('5203-n-monte-vista', 'eli.pm@example.com', 'pm', 'seed-cohesive'),
  ('9146-w-hutton-dr', 'eli.pm@example.com', 'pm', 'seed-cohesive'),
  ('3526-emerson-street', 'eli.pm@example.com', 'pm', 'seed-cohesive'),
  ('6402-e-bambi-drive', 'eli.pm@example.com', 'pm', 'seed-cohesive'),
  ('12729-w-keim-dr', 'eli.pm@example.com', 'pm', 'seed-cohesive')
on conflict (job_id, email) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Labor Shifts (`crew_shifts`) across Today, WTD, MTD, YTD + Prior Periods
-- ---------------------------------------------------------------------------
delete from public.crew_shifts where client_in like 'seed-%';

insert into public.crew_shifts (
  email, job_id, job_name, day, started_at, ended_at, break_min, trade, note, source, end_source, status, client_in
)
values
  -- TODAY (current_date): 7 shifts across Framing, Drywall, Paint, Finish, General
  ('tacho.framing@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', current_date,
   (current_date + time '06:00') at time zone 'America/Phoenix',
   (current_date + time '14:30') at time zone 'America/Phoenix',
   30, 'framing', 'Franklin Hall 2-hr shaft wall framing & soffit layout', 'app', 'app', 'ok', 'seed-today-1'),
  ('arnold.framing@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', current_date,
   (current_date + time '06:00') at time zone 'America/Phoenix',
   (current_date + time '14:30') at time zone 'America/Phoenix',
   30, 'framing', 'Metal stud framing & door bucks at classrooms', 'app', 'app', 'ok', 'seed-today-2'),
  ('filiberto.framing@example.com', '8009-n-ironwood-dr', '8009 N Ironwood Dr (Jury AFT 123)', current_date,
   (current_date + time '06:30') at time zone 'America/Phoenix',
   (current_date + time '15:00') at time zone 'America/Phoenix',
   30, 'framing', 'CO-3 theater acoustic soffit & ceiling backing', 'app', 'app', 'ok', 'seed-today-3'),
  ('david.drywall@example.com', '6402-e-bambi-drive', '6402 E Bambi Drive (Woodward)', current_date,
   (current_date + time '06:30') at time zone 'America/Phoenix',
   (current_date + time '15:00') at time zone 'America/Phoenix',
   30, 'drywall', 'Level 4 skim coat & hallway corner bead', 'app', 'app', 'ok', 'seed-today-4'),
  ('juan.drywall@example.com', '6402-e-bambi-drive', '6402 E Bambi Drive (Woodward)', current_date,
   (current_date + time '06:30') at time zone 'America/Phoenix',
   (current_date + time '14:30') at time zone 'America/Phoenix',
   30, 'drywall', 'Drywall tape & second coat in primary suite', 'app', 'app', 'ok', 'seed-today-5'),
  ('jesus.paint@example.com', '3526-emerson-street', '3526 Emerson Street (Powell)', current_date,
   (current_date + time '07:00') at time zone 'America/Phoenix',
   (current_date + time '15:30') at time zone 'America/Phoenix',
   30, 'paint', 'Prime & first finish coat in casita', 'app', 'app', 'ok', 'seed-today-6'),
  ('cesar.finish@example.com', '5203-n-monte-vista', '5203 N Monte Vista Dr (Peter Rabbit AFT 125)', current_date,
   (current_date + time '07:00') at time zone 'America/Phoenix',
   (current_date + time '14:30') at time zone 'America/Phoenix',
   30, 'finish-carpentry', 'Baseboard & casing punch list items', 'app', 'app', 'ok', 'seed-today-7'),

  -- YESTERDAY (current_date - 1): 8 shifts (in WTD if Tue-Sun, and Yesterday comparison for Today)
  ('tacho.framing@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', current_date - 1,
   ((current_date - 1) + time '06:00') at time zone 'America/Phoenix',
   ((current_date - 1) + time '15:00') at time zone 'America/Phoenix',
   30, 'framing', 'Corridor top track & deflection clips', 'app', 'app', 'ok', 'seed-yest-1'),
  ('arnold.framing@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', current_date - 1,
   ((current_date - 1) + time '06:00') at time zone 'America/Phoenix',
   ((current_date - 1) + time '15:00') at time zone 'America/Phoenix',
   30, 'framing', 'Corridor framing & backing', 'app', 'app', 'ok', 'seed-yest-2'),
  ('filiberto.framing@example.com', '8009-n-ironwood-dr', '8009 N Ironwood Dr (Jury AFT 123)', current_date - 1,
   ((current_date - 1) + time '06:30') at time zone 'America/Phoenix',
   ((current_date - 1) + time '15:00') at time zone 'America/Phoenix',
   30, 'framing', 'Workout room & theater framing', 'app', 'app', 'ok', 'seed-yest-3'),
  ('david.drywall@example.com', '6402-e-bambi-drive', '6402 E Bambi Drive (Woodward)', current_date - 1,
   ((current_date - 1) + time '06:30') at time zone 'America/Phoenix',
   ((current_date - 1) + time '15:30') at time zone 'America/Phoenix',
   30, 'drywall', 'Hang 5/8 Type X lid in garage & kitchen', 'app', 'app', 'ok', 'seed-yest-4'),
  ('juan.drywall@example.com', '6402-e-bambi-drive', '6402 E Bambi Drive (Woodward)', current_date - 1,
   ((current_date - 1) + time '06:30') at time zone 'America/Phoenix',
   ((current_date - 1) + time '15:00') at time zone 'America/Phoenix',
   30, 'drywall', 'Hang drywall sheets', 'app', 'app', 'ok', 'seed-yest-5'),
  ('carlos.drywall@example.com', '8009-n-ironwood-dr', '8009 N Ironwood Dr (Jury AFT 123)', current_date - 1,
   ((current_date - 1) + time '06:30') at time zone 'America/Phoenix',
   ((current_date - 1) + time '15:00') at time zone 'America/Phoenix',
   30, 'drywall', 'Level 5 skim coat on gallery wall', 'app', 'app', 'ok', 'seed-yest-6'),
  ('jesus.paint@example.com', '3526-emerson-street', '3526 Emerson Street (Powell)', current_date - 1,
   ((current_date - 1) + time '07:00') at time zone 'America/Phoenix',
   ((current_date - 1) + time '15:30') at time zone 'America/Phoenix',
   30, 'paint', 'Masking & primer prep in casita', 'app', 'app', 'ok', 'seed-yest-7'),
  ('omar.runner@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', current_date - 1,
   ((current_date - 1) + time '07:00') at time zone 'America/Phoenix',
   ((current_date - 1) + time '13:30') at time zone 'America/Phoenix',
   30, 'general', 'Material delivery & staging at Franklin Hall', 'app', 'app', 'ok', 'seed-yest-8');

-- Generate systematic historical shifts across Last Week (days -7..-2), Earlier This Month (days -18..-8),
-- Last Month (days -48..-20), and Earlier This Year (Jan-Aug 2026) so WTD, MTD, YTD and deltas are rich.
insert into public.crew_shifts (
  email, job_id, job_name, day, started_at, ended_at, break_min, trade, note, source, end_source, status, client_in
)
select
  w.email,
  w.job_id,
  w.job_name,
  d.day::date,
  (d.day::date + time '06:30') at time zone 'America/Phoenix',
  (d.day::date + time '15:00') at time zone 'America/Phoenix',
  30,
  w.trade,
  'Scheduled field shift (' || w.trade || ')',
  'app',
  'app',
  'ok',
  'seed-hist-' || w.idx || '-' || to_char(d.day::date, 'YYYYMMDD')
from (
  values
    (1, 'tacho.framing@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', 'framing'),
    (2, 'arnold.framing@example.com', '8009-n-ironwood-dr', '8009 N Ironwood Dr (Jury AFT 123)', 'framing'),
    (3, 'filiberto.framing@example.com', '12729-w-keim-dr', '12729 W Keim Dr (McHugh)', 'framing'),
    (4, 'david.drywall@example.com', '6402-e-bambi-drive', '6402 E Bambi Drive (Woodward)', 'drywall'),
    (5, 'juan.drywall@example.com', '3526-emerson-street', '3526 Emerson Street (Powell)', 'drywall'),
    (6, 'carlos.drywall@example.com', '8009-n-ironwood-dr', '8009 N Ironwood Dr (Jury AFT 123)', 'drywall'),
    (7, 'jesus.paint@example.com', '3526-emerson-street', '3526 Emerson Street (Powell)', 'paint'),
    (8, 'cesar.finish@example.com', '5203-n-monte-vista', '5203 N Monte Vista Dr (Peter Rabbit AFT 125)', 'finish-carpentry'),
    (9, 'omar.runner@example.com', '4125-e-camelback-rd', '4125 E Camelback Rd (Carder AFT 129)', 'general'),
    (10, 'eli.pm@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', 'general')
) as w(idx, email, job_id, job_name, trade)
cross join (
  -- Workdays across the past 60 days + monthly representative weeks back to Jan 2026
  select (current_date - offs) as day
  from generate_series(2, 55) as offs
  where extract(isodow from (current_date - offs)) between 1 and 5
  union
  select (date '2026-01-12' + (m * 28) + d) as day
  from generate_series(0, 7) as m
  cross join generate_series(0, 4) as d
  where (date '2026-01-12' + (m * 28) + d) < current_date - 55
) as d
where (w.idx + extract(day from d.day)::int) % 2 = 0;

-- ---------------------------------------------------------------------------
-- 5. Job Aliases & Purchases (`purchases`) across Today, WTD, MTD, YTD
-- ---------------------------------------------------------------------------
insert into public.job_aliases (alias, job_id, created_by)
values
  ('8009 ironwood', '8009-n-ironwood-dr', 'seed-cohesive'),
  ('jury', '8009-n-ironwood-dr', 'seed-cohesive'),
  ('peter rabbit', '5203-n-monte-vista', 'seed-cohesive'),
  ('5203 monte vista', '5203-n-monte-vista', 'seed-cohesive'),
  ('bellevue', '9146-w-hutton-dr', 'seed-cohesive'),
  ('powell', '3526-emerson-street', 'seed-cohesive'),
  ('bambi', '6402-e-bambi-drive', 'seed-cohesive'),
  ('keim', '12729-w-keim-dr', 'seed-cohesive')
on conflict (alias) do update
  set job_id = excluded.job_id,
      updated_at = now();

delete from public.purchases where source_key like 'hd:seed:%' or source_key like 'vendor:seed:%' or source_key like 'app:seed:%';

insert into public.purchases (
  source, source_key, purchased_on, vendor, store, order_ref,
  job_name_raw, job_key, job_id, trade, trade_manual, department, class,
  sku, description, qty, line_total_cents, meta
)
values
  -- TODAY (current_date)
  ('hd', 'hd:seed:' || to_char(current_date, 'YYYYMMDD') || ':0404:01:9001:1', current_date,
   'Home Depot', 'Scottsdale #0404', 'PO-9146', 'BELLEVUE AC938', 'bellevue ac938', '9146-w-hutton-dr',
   'framing', false, 'LUMBER', 'METAL STUDS', '100284910', '3-5/8 in. x 10 ft. 20-Gauge EQ Structural Metal Stud', 120, 148800, '{"runner": "Omar Pena"}'::jsonb),
  ('hd', 'hd:seed:' || to_char(current_date, 'YYYYMMDD') || ':0404:01:9001:2', current_date,
   'Home Depot', 'Scottsdale #0404', 'PO-9146', 'BELLEVUE AC938', 'bellevue ac938', '9146-w-hutton-dr',
   'framing', true, 'HARDWARE', 'FASTENERS', '100391022', 'Grabber #8 x 1/2 in. Modified Truss Head Self-Drilling Pan Framing Screws (5,000-Pack)', 3, 26700, '{"runner": "Omar Pena"}'::jsonb),
  ('hd', 'hd:seed:' || to_char(current_date, 'YYYYMMDD') || ':0404:02:9002:1', current_date,
   'Home Depot', 'Scottsdale #0404', 'PO-6402', '6402 E BAMBI', '6402 e bambi', '6402-e-bambi-drive',
   'drywall', false, 'BLDG. MATERIALS', 'GYPSUM', '100120445', 'USG Sheetrock 5/8 in. x 4 ft. x 12 ft. Firecode X Drywall', 48, 95040, '{"runner": "David Morales"}'::jsonb),
  ('hd', 'hd:seed:' || to_char(current_date, 'YYYYMMDD') || ':0404:02:9002:2', current_date,
   'Home Depot', 'Scottsdale #0404', 'PO-6402', '6402 E BAMBI', '6402 e bambi', '6402-e-bambi-drive',
   'drywall', false, 'BLDG. MATERIALS', 'GYPSUM', '100120889', 'USG Plus 3 4.5 Gal. Pre-Mixed All Purpose Joint Compound', 12, 26160, '{"runner": "David Morales"}'::jsonb),
  ('vendor', 'vendor:seed:' || to_char(current_date, 'YYYYMMDD') || ':sw:3101:1', current_date,
   'Sherwin-Williams', 'Tempe Commercial #7214', 'SW-3526', '3526 EMERSON ST', '3526 emerson st', '3526-emerson-street',
   'paint', true, 'PAINT', 'INTERIOR COATINGS', 'SW-6106', 'SuperPaint Interior Acrylic Latex Satin — Kilim Beige (5 Gal Pail)', 6, 118800, '{"runner": "Jesus Mendoza"}'::jsonb),

  -- YESTERDAY (current_date - 1)
  ('hd', 'hd:seed:' || to_char(current_date - 1, 'YYYYMMDD') || ':0404:01:8901:1', current_date - 1,
   'Home Depot', 'Scottsdale #0404', 'PO-8009', '8009 IRONWOOD', '8009 ironwood', '8009-n-ironwood-dr',
   'framing', false, 'LUMBER', 'DIMENSIONAL LUMBER', '100001234', '2 in. x 6 in. x 16 ft. #2 Prime Kiln-Dried Douglas Fir Stud', 85, 114750, '{"runner": "Mateo Mujica"}'::jsonb),
  ('hd', 'hd:seed:' || to_char(current_date - 1, 'YYYYMMDD') || ':0404:01:8901:2', current_date - 1,
   'Home Depot', 'Scottsdale #0404', 'PO-8009', '8009 IRONWOOD', '8009 ironwood', '8009-n-ironwood-dr',
   'insulation', false, 'BLDG. MATERIALS', 'INSULATION', '100556112', 'Owens Corning R-19 Kraft Faced Fiberglass Insulation Batt 6.25 in. x 15 in.', 24, 182400, '{"runner": "Mateo Mujica"}'::jsonb),
  ('vendor', 'vendor:seed:' || to_char(current_date - 1, 'YYYYMMDD') || ':abs:4401:1', current_date - 1,
   'Arizona Building Supply', 'Phoenix Yard', 'ABS-9146', '9146 W HUTTON DR', '9146 w hutton dr', '9146-w-hutton-dr',
   'drywall', true, 'BLDG. MATERIALS', 'GYPSUM', 'ABS-AR58', 'National Gypsum Gold Bond 5/8 in. XP Hi-Abuse Drywall 4x12', 110, 352000, '{"runner": "Eli Ramirez"}'::jsonb),

  -- EARLIER IN WTD / LAST WEEK (current_date - 4 .. current_date - 2)
  ('hd', 'hd:seed:' || to_char(current_date - 3, 'YYYYMMDD') || ':0411:03:8801:1', current_date - 3,
   'Home Depot', 'Paradise Valley #0411', 'PO-8009', 'JURY 8009', 'jury 8009', '8009-n-ironwood-dr',
   'drywall', false, 'BLDG. MATERIALS', 'GYPSUM', '100991231', 'Trim-Tex Tear Away L Bead 10 ft. (50-Box)', 4, 54000, '{"runner": "Carlos Habana"}'::jsonb),
  ('vendor', 'vendor:seed:' || to_char(current_date - 4, 'YYYYMMDD') || ':sunbelt:701:1', current_date - 4,
   'Sunbelt Rentals', 'Phoenix Branch #218', 'SB-9146', '9146 W HUTTON DR', '9146 w hutton dr', '9146-w-hutton-dr',
   'rentals', true, 'TOOL RENTAL', 'SCISSOR LIFTS', 'SB-1930ES', 'JLG 1930ES 19 ft. Electric Scissor Lift — Weekly Rental', 2, 128000, '{"runner": "Eli Ramirez"}'::jsonb),
  ('hd', 'hd:seed:' || to_char(current_date - 5, 'YYYYMMDD') || ':0404:02:8750:1', current_date - 5,
   'Home Depot', 'Scottsdale #0404', 'PO-5203', 'PETER RABBIT', 'peter rabbit', '5203-n-monte-vista',
   'finish-carpentry', true, 'MILLWORK', 'MOULDING', '100772110', '11/16 in. x 5-1/4 in. x 16 ft. Primed MDF Speed Base Moulding', 64, 153600, '{"runner": "Cesar Olivares"}'::jsonb),
  ('hd', 'hd:seed:' || to_char(current_date - 6, 'YYYYMMDD') || ':0404:02:8712:1', current_date - 6,
   'Home Depot', 'Scottsdale #0404', 'PO-12729', '12729 W KEIM DR', '12729 w keim dr', '12729-w-keim-dr',
   'framing', false, 'LUMBER', 'SHEATHING', '100221899', '7/16 in. x 4 ft. x 8 ft. OSB Sheathing Panel', 90, 179100, '{"runner": "Filiberto Villegas"}'::jsonb),
  ('hd', 'hd:seed:' || to_char(current_date - 6, 'YYYYMMDD') || ':0404:02:8712:2', current_date - 6,
   'Home Depot', 'Scottsdale #0404', 'PO-12729', '12729 W KEIM DR', '12729 w keim dr', '12729-w-keim-dr',
   'framing', false, 'LUMBER', 'SHEATHING', '100221899', 'RETURN: Damaged OSB Sheathing Panels', -6, -11940, '{"runner": "Filiberto Villegas"}'::jsonb),

  -- EARLIER IN MTD (current_date - 15 .. current_date - 8)
  ('hd', 'hd:seed:' || to_char(current_date - 9, 'YYYYMMDD') || ':0404:01:8501:1', current_date - 9,
   'Home Depot', 'Scottsdale #0404', 'PO-3526', '3526 EMERSON', '3526 emerson', '3526-emerson-street',
   'tile', true, 'FLOORING', 'TILE', '100881223', 'Custom Building Products ProLite 30 lb. Large Format Tile Mortar', 28, 89600, '{"runner": "Omar Pena"}'::jsonb),
  ('vendor', 'vendor:seed:' || to_char(current_date - 11, 'YYYYMMDD') || ':wc:620:1', current_date - 11,
   'White Cap', 'Phoenix Central', 'WC-9146', '9146 W HUTTON', '9146 w hutton', '9146-w-hutton-dr',
   'tools', true, 'HARDWARE', 'POWER TOOLS', 'WC-HILTI-GX3', 'Hilti GX 3 Gas-Actuated Fastening Tool + 2,400 Pins Kit', 1, 164500, '{"runner": "Mateo Mujica"}'::jsonb),
  ('hd', 'hd:seed:' || to_char(current_date - 13, 'YYYYMMDD') || ':0408:04:8310:1', current_date - 13,
   'Home Depot', 'Mesa #0408', 'PO-4125', '4125 CAMELBACK', '4125 camelback', '4125-e-camelback-rd',
   'demo', true, 'CLEANING', 'DEMO BAGS', '100441002', '42 Gal. Contractor Clean-Up Bags (50-Count) + Dumpster Liner', 10, 34900, '{"runner": "Omar Pena"}'::jsonb),
  ('vendor', 'vendor:seed:' || to_char(current_date - 15, 'YYYYMMDD') || ':sw:2998:1', current_date - 15,
   'Sherwin-Williams', 'Scottsdale #7102', 'SW-6402', '6402 E BAMBI', '6402 e bambi', '6402-e-bambi-drive',
   'paint', true, 'PAINT', 'PRIMER', 'SW-PVA-5G', 'ProMar 200 Zero VOC Interior Latex Primer (5 Gal Pail)', 8, 96000, '{"runner": "Jesus Mendoza"}'::jsonb),

  -- PREVIOUS MONTH (current_date - 42 .. current_date - 22)
  ('hd', 'hd:seed:' || to_char(current_date - 25, 'YYYYMMDD') || ':0404:01:7801:1', current_date - 25,
   'Home Depot', 'Scottsdale #0404', 'PO-8009', '8009 IRONWOOD', '8009 ironwood', '8009-n-ironwood-dr',
   'framing', false, 'LUMBER', 'LVL BEAMS', '100990111', 'Boise Cascade Versa-Lam 1-3/4 in. x 11-7/8 in. x 20 ft. LVL Beam', 6, 288000, '{"runner": "Mateo Mujica"}'::jsonb),
  ('vendor', 'vendor:seed:' || to_char(current_date - 30, 'YYYYMMDD') || ':abs:3900:1', current_date - 30,
   'Arizona Building Supply', 'Phoenix Yard', 'ABS-3526', '3526 EMERSON', '3526 emerson', '3526-emerson-street',
   'drywall', true, 'BLDG. MATERIALS', 'GYPSUM', 'ABS-UL12', 'USG Sheetrock UltraLight 1/2 in. x 4 ft. x 12 ft. Drywall', 140, 294000, '{"runner": "David Morales"}'::jsonb),
  ('hd', 'hd:seed:' || to_char(current_date - 36, 'YYYYMMDD') || ':0404:02:7610:1', current_date - 36,
   'Home Depot', 'Scottsdale #0404', 'PO-12729', '12729 W KEIM', '12729 w keim', '12729-w-keim-dr',
   'framing', false, 'LUMBER', 'STUDS', '100001200', '2 in. x 4 in. x 104-5/8 in. Prime Kiln-Dried Stud (Bunk of 294)', 2, 312000, '{"runner": "Filiberto Villegas"}'::jsonb),

  -- EARLIER IN YTD (Jan-Aug 2026)
  ('hd', 'hd:seed:20260218:0404:01:5101:1', date '2026-02-18',
   'Home Depot', 'Scottsdale #0404', 'PO-3526', '3526 EMERSON', '3526 emerson', '3526-emerson-street',
   'framing', false, 'LUMBER', 'FRAMING LUMBER', '100001550', 'Main Addition Framing Lumber Package (2x6 & Trusses)', 1, 845000, '{"runner": "Mateo Mujica"}'::jsonb),
  ('vendor', 'vendor:seed:20260409:abs:2100:1', date '2026-04-09',
   'Arizona Building Supply', 'Phoenix Yard', 'ABS-5203', '5203 MONTE VISTA', '5203 monte vista', '5203-n-monte-vista',
   'drywall', true, 'BLDG. MATERIALS', 'GYPSUM', 'ABS-58X', 'Whole-House 5/8 Type X Drywall & Corner Bead Delivery', 1, 692000, '{"runner": "David Morales"}'::jsonb),
  ('vendor', 'vendor:seed:20260615:sw:1880:1', date '2026-06-15',
   'Sherwin-Williams', 'Scottsdale #7102', 'SW-5203', '5203 MONTE VISTA', '5203 monte vista', '5203-n-monte-vista',
   'paint', true, 'PAINT', 'EXTERIOR', 'SW-DURATION', 'Duration Exterior Acrylic Coating + Elastomeric Stucco Sealer', 1, 418000, '{"runner": "Jesus Mendoza"}'::jsonb),
  ('hd', 'hd:seed:20260722:0404:01:6400:1', date '2026-07-22',
   'Home Depot', 'Scottsdale #0404', 'PO-8009', '8009 IRONWOOD', '8009 ironwood', '8009-n-ironwood-dr',
   'insulation', false, 'BLDG. MATERIALS', 'INSULATION', '100556890', 'Rockwool Safe n Sound 3 in. x 15-1/4 in. Mineral Wool Soundproofing', 45, 369000, '{"runner": "Omar Pena"}'::jsonb),

  -- UNMATCHED REGISTER ALIASES ("Which job is this?" queue)
  ('hd', 'hd:seed:' || to_char(current_date - 2, 'YYYYMMDD') || ':0404:03:9105:1', current_date - 2,
   'Home Depot', 'Scottsdale #0404', 'PO-BAMBI-PATIO', 'BAMBI BACKYARD', 'bambi backyard', null,
   'framing', false, 'LUMBER', 'TREATED LUMBER', '100334912', '4 in. x 6 in. x 12 ft. #2 Pressure-Treated Ground Contact Timber', 14, 67200, '{"runner": "Omar Pena"}'::jsonb),
  ('hd', 'hd:seed:' || to_char(current_date - 7, 'YYYYMMDD') || ':0411:02:8890:1', current_date - 7,
   'Home Depot', 'Paradise Valley #0411', 'PO-TACHO', 'TACHO CASITA', 'tacho casita', null,
   'drywall', false, 'BLDG. MATERIALS', 'GYPSUM', '100120445', 'USG Sheetrock 5/8 in. x 4 ft. x 12 ft. Firecode X Drywall', 32, 63360, '{"runner": "Mateo Mujica"}'::jsonb);

-- ---------------------------------------------------------------------------
-- 6. Subcontractors (`subs`), Bid Packages (`bid_packages`) & AP (`bills`, `bill_payments`)
-- ---------------------------------------------------------------------------
insert into public.subs (
  id, name, trades, status, phone, email, address,
  roc_license, roc_verified_at, roc_verified_by,
  coi_expires_on, w9_on_file, msa_signed_on, ach_confirmed_at, ach_confirmed_by, note, created_by
)
values
  (
    'd0000001-0000-4000-8000-000000000001',
    'Medina Pro Drywall LLC (Synthetic)',
    array['drywall', 'insulation'],
    'approved',
    '555-0201',
    'bids.medina@example.com',
    '4110 W Indian School Rd, Phoenix, AZ 85019',
    'ROC-318940',
    now() - interval '60 days',
    'Lando',
    current_date + 120,
    true,
    current_date - 90,
    now() - interval '60 days',
    'Ilene',
    'Approved commercial & high-end residential drywall sub.',
    'seed-cohesive'
  ),
  (
    'd0000001-0000-4000-8000-000000000002',
    'Mega Valley Electrical LLC (Synthetic)',
    array['electrical'],
    'approved',
    '555-0202',
    'ap.megaelectric@example.com',
    '2815 E McDowell Rd, Phoenix, AZ 85008',
    'ROC-294112',
    now() - interval '120 days',
    'Lando',
    current_date + 85,
    true,
    current_date - 150,
    now() - interval '120 days',
    'Ilene',
    'Electrical rough-in & trim sub (Jury & Monte Vista).',
    'seed-cohesive'
  ),
  (
    'd0000001-0000-4000-8000-000000000003',
    'Sonoran Thermal Insulation LLC (Synthetic)',
    array['insulation'],
    'approved',
    '555-0203',
    'estimating.sonoran@example.com',
    '1920 W Broadway Rd, Mesa, AZ 85202',
    'ROC-330415',
    now() - interval '45 days',
    'Lando',
    current_date - 5, -- Expired 5 days ago -> triggers COI hold!
    true,
    current_date - 60,
    now() - interval '45 days',
    'Ilene',
    'COI expired 5 days ago; hold payment until updated certificate is uploaded.',
    'seed-cohesive'
  ),
  (
    'd0000001-0000-4000-8000-000000000004',
    'GBD Desert Painting LLC (Synthetic)',
    array['paint'],
    'approved',
    '555-0204',
    'office.gbdpaint@example.com',
    '7410 E Shea Blvd, Scottsdale, AZ 85260',
    'ROC-309881',
    now() - interval '90 days',
    'Lando',
    current_date + 210,
    true,
    current_date - 90,
    now() - interval '90 days',
    'Ilene',
    'Interior & exterior painting sub.',
    'seed-cohesive'
  ),
  (
    'd0000001-0000-4000-8000-000000000005',
    'AD Valley Concrete LLC (Synthetic)',
    array['concrete'],
    'onboarding',
    '555-0205',
    'ad.concrete@example.com',
    '5502 W Glendale Ave, Glendale, AZ 85301',
    'ROC-341009',
    now() - interval '10 days',
    'Lando',
    current_date + 180,
    false, -- W-9 missing
    null,
    null,
    '',
    'Onboarding in progress — awaiting signed W-9 and MSA.',
    'seed-cohesive'
  )
on conflict (id) do update
  set name = excluded.name,
      trades = excluded.trades,
      status = excluded.status,
      coi_expires_on = excluded.coi_expires_on,
      w9_on_file = excluded.w9_on_file,
      msa_signed_on = excluded.msa_signed_on,
      note = excluded.note,
      updated_at = now();

insert into public.bid_packages (
  id, job_id, trade, title, scope, lines, status, awarded_at, awarded_by, created_by
)
values
  (
    'e0000001-0000-4000-8000-000000000001',
    'b0000001-0000-4000-8000-000000009146',
    'insulation',
    'Bellevue AC938 — Acoustic & Thermal Batt Insulation',
    'Furnish and install R-19 thermal and sound attenuation batts at Franklin Hall classrooms and 2-hr rated shaft walls.',
    '[{"id": "r19-walls", "description": "R-19 Exterior & Classroom Acoustic Batts", "qty": 14200, "unit": "SF", "ourCents": 2130000}, {"id": "shaft-sound", "description": "2-Hr Shaft Wall Mineral Wool Sound Batts", "qty": 3800, "unit": "SF", "ourCents": 950000}]'::jsonb,
    'awarded',
    now() - interval '25 days',
    'Marco',
    'seed-cohesive'
  ),
  (
    'e0000001-0000-4000-8000-000000000002',
    'b0000001-0000-4000-8000-000000008009',
    'electrical',
    'Jury Residence (8009) — Theater & Workout Room Electrical Rough-In',
    'Low-voltage & line-voltage rough-in for Workout Room and Home Theater soffit.',
    '[{"id": "elec-rough", "description": "Theater & Gym Rough-In + Dedicated Subpanel", "qty": 1, "unit": "LS", "ourCents": 1850000}]'::jsonb,
    'awarded',
    now() - interval '35 days',
    'Marco',
    'seed-cohesive'
  ),
  (
    'e0000001-0000-4000-8000-000000000003',
    'b0000001-0000-4000-8000-000000003526',
    'paint',
    'Powell Residence (3526) — Whole-Home & Casita Fine Finish Paint',
    'Level 4/5 prime, two finish coats on walls/ceilings, and sprayed enamel trim package.',
    '[{"id": "paint-main", "description": "Main Residence Interior Paint", "qty": 6800, "unit": "SF", "ourCents": 2380000}, {"id": "paint-casita", "description": "Casita Interior & Exterior Stucco Paint", "qty": 1800, "unit": "SF", "ourCents": 820000}]'::jsonb,
    'awarded',
    now() - interval '20 days',
    'Marco',
    'seed-cohesive'
  )
on conflict (id) do update
  set title = excluded.title,
      status = excluded.status,
      updated_at = now();

-- Clean & insert AP Bills (`bills`) and AP Payments (`bill_payments`)
delete from public.bill_payments where recorded_by = 'seed-cohesive';
delete from public.bills where created_by = 'seed-cohesive';

insert into public.bills (
  id, bill_number, kind, vendor_name, sub_id, job_id, crew_job_id, bid_package_id, purchase_trip_key,
  trade, description, lines, issued_on, due_on, amount_cents, retainage_cents,
  status, waiver_status, payment_terms, approved_by, approved_at, note, created_by
)
values
  -- 1. Due this Friday (scheduled for Friday check/Melio run)
  (
    'f1000001-0000-4000-8000-000000000001',
    'MED-2026-108',
    'sub',
    'Medina Pro Drywall LLC (Synthetic)',
    'd0000001-0000-4000-8000-000000000001',
    'b0000001-0000-4000-8000-000000009146',
    '9146-w-hutton-dr',
    null,
    null,
    'drywall',
    'Bellevue AC938 — Classroom Drywall Hang & Fire Tape Draw #2',
    '[{"description": "Classroom 5/8 Type X Hang (12,000 SF)", "trade": "drywall", "qty": 12000, "unitCents": 115, "totalCents": 1380000}, {"description": "2-Hr Rated Shaft Wall Fire Tape", "trade": "drywall", "qty": 1, "unitCents": 320000, "totalCents": 320000}]'::jsonb,
    current_date,
    current_date + 3,
    1700000,
    170000,
    'scheduled',
    'conditional_received',
    'friday_run',
    'Marco',
    now() - interval '2 hours',
    'Approved for Friday Melio run; conditional progress waiver on file.',
    'seed-cohesive'
  ),
  -- 2. Past due sub bill (Mega Electrical — SOP-004 scenario)
  (
    'f1000001-0000-4000-8000-000000000002',
    'MVE-8009-02',
    'sub',
    'Mega Valley Electrical LLC (Synthetic)',
    'd0000001-0000-4000-8000-000000000002',
    'b0000001-0000-4000-8000-000000008009',
    '8009-n-ironwood-dr',
    'e0000001-0000-4000-8000-000000000002',
    null,
    'electrical',
    'Jury Residence (8009) — Theater & Gym Rough-In Progress Draw (80%)',
    '[{"description": "Theater & Workout Room Rough Electrical (80%)", "trade": "electrical", "qty": 1, "unitCents": 940000, "totalCents": 940000}]'::jsonb,
    current_date - 14,
    current_date - 4,
    940000,
    0,
    'open',
    'conditional_received',
    'friday_run',
    'Marco',
    now() - interval '5 days',
    '4 days past due — prioritize on this week''s Melio ACH run.',
    'seed-cohesive'
  ),
  -- 3. Hold: Missing conditional waiver + expired COI (Sonoran Thermal Insulation)
  (
    'f1000001-0000-4000-8000-000000000003',
    'STI-9146-01',
    'sub',
    'Sonoran Thermal Insulation LLC (Synthetic)',
    'd0000001-0000-4000-8000-000000000003',
    'b0000001-0000-4000-8000-000000009146',
    '9146-w-hutton-dr',
    'e0000001-0000-4000-8000-000000000001',
    null,
    'insulation',
    'Bellevue AC938 — Sound & Thermal Batt Draw #1 (50%)',
    '[{"description": "R-19 Exterior & Classroom Batt Insulation (50%)", "trade": "insulation", "qty": 7100, "unitCents": 150, "totalCents": 1065000}, {"description": "Shaft Wall Sound Attenuation Batts", "trade": "insulation", "qty": 1900, "unitCents": 200, "totalCents": 380000}]'::jsonb,
    current_date - 3,
    current_date + 7,
    1445000,
    144500,
    'hold_waiver',
    'missing',
    'pay_when_paid',
    '',
    null,
    'HOLD: Conditional waiver missing AND COI expired 5 days ago (SOP-008 rule 1 & 4).',
    'seed-cohesive'
  ),
  -- 4. Partially paid sub bill (GBD Desert Painting on Powell)
  (
    'f1000001-0000-4000-8000-000000000004',
    'GBD-3526-01',
    'sub',
    'GBD Desert Painting LLC (Synthetic)',
    'd0000001-0000-4000-8000-000000000004',
    'b0000001-0000-4000-8000-000000003526',
    '3526-emerson-street',
    'e0000001-0000-4000-8000-000000000003',
    null,
    'paint',
    'Powell Residence (3526) — Interior Prime & Trim Enamel Draw #1',
    '[{"description": "Main House Interior Prime & 1st Coat", "trade": "paint", "qty": 1, "unitCents": 1150000, "totalCents": 1150000}]'::jsonb,
    current_date - 10,
    current_date + 2,
    1150000,
    0,
    'partial',
    'conditional_received',
    'friday_run',
    'Marco',
    now() - interval '8 days',
    'Paid $5,750 initial draw check; $5,750 balance scheduled for Friday.',
    'seed-cohesive'
  ),
  -- 5. Vendor invoice linked to Arizona Building Supply purchase trip
  (
    'f1000001-0000-4000-8000-000000000005',
    'ABS-INV-4401',
    'vendor',
    'Arizona Building Supply',
    null,
    'b0000001-0000-4000-8000-000000009146',
    '9146-w-hutton-dr',
    null,
    'vendor:seed:' || to_char(current_date - 1, 'YYYYMMDD') || ':abs:4401',
    'drywall',
    '110 sheets Gold Bond 5/8 in. XP Hi-Abuse Drywall 4x12 delivered to Bellevue AC938',
    '[{"description": "National Gypsum Gold Bond 5/8 in. XP Hi-Abuse Drywall 4x12", "trade": "drywall", "qty": 110, "unitCents": 3200, "totalCents": 352000}]'::jsonb,
    current_date - 1,
    current_date + 14,
    352000,
    0,
    'open',
    'conditional_received',
    'net_15',
    'Eli Ramirez',
    now() - interval '1 day',
    'Matched to PO ABS-9146 and delivery photo.',
    'seed-cohesive'
  ),
  -- 6. Equipment rental bill linked to Sunbelt Rentals purchase trip
  (
    'f1000001-0000-4000-8000-000000000006',
    'SB-INV-701',
    'rental',
    'Sunbelt Rentals',
    null,
    'b0000001-0000-4000-8000-000000009146',
    '9146-w-hutton-dr',
    null,
    'vendor:seed:' || to_char(current_date - 4, 'YYYYMMDD') || ':sunbelt:701',
    'rentals',
    'Two JLG 1930ES 19 ft. Electric Scissor Lifts — Franklin Hall',
    '[{"description": "JLG 1930ES 19 ft. Electric Scissor Lift Weekly Rental (x2)", "trade": "rentals", "qty": 2, "unitCents": 64000, "totalCents": 128000}]'::jsonb,
    current_date - 4,
    current_date + 10,
    128000,
    0,
    'open',
    'not_required',
    'net_15',
    'Eli Ramirez',
    now() - interval '3 days',
    'Active rental on site at Bellevue.',
    'seed-cohesive'
  ),
  -- 7. Needs approval bill (AD Valley Concrete)
  (
    'f1000001-0000-4000-8000-000000000007',
    'ADC-6402-01',
    'sub',
    'AD Valley Concrete LLC (Synthetic)',
    'd0000001-0000-4000-8000-000000000005',
    'b0000001-0000-4000-8000-000000006402',
    '6402-e-bambi-drive',
    null,
    null,
    'concrete',
    'Woodward (6402 Bambi) — Addition Stem Wall & Slab Pour',
    '[{"description": "Addition Footing & Post-Tension Slab Patch", "trade": "concrete", "qty": 1, "unitCents": 680000, "totalCents": 680000}]'::jsonb,
    current_date - 6,
    current_date + 5,
    680000,
    0,
    'needs_approval',
    'missing',
    'friday_run',
    '',
    null,
    'Awaiting PM verification of stem wall pour + W-9 onboarding packet.',
    'seed-cohesive'
  ),
  -- 8. Paid sub bill earlier this month (Medina Drywall on Jury)
  (
    'f1000001-0000-4000-8000-000000000008',
    'MED-2026-094',
    'sub',
    'Medina Pro Drywall LLC (Synthetic)',
    'd0000001-0000-4000-8000-000000000001',
    'b0000001-0000-4000-8000-000000008009',
    '8009-n-ironwood-dr',
    null,
    null,
    'drywall',
    'Jury Residence (8009) — Level 5 Drywall Skim Coat Draw #1',
    '[{"description": "Level 5 Skim Coat Main Living & Gallery", "trade": "drywall", "qty": 1, "unitCents": 1420000, "totalCents": 1420000}]'::jsonb,
    current_date - 16,
    current_date - 9,
    1420000,
    0,
    'paid',
    'conditional_received',
    'friday_run',
    'Marco',
    now() - interval '12 days',
    'Paid in full via Melio ACH with signed conditional waiver.',
    'seed-cohesive'
  ),
  -- 9. Paid vendor bill last month (Sherwin-Williams)
  (
    'f1000001-0000-4000-8000-000000000009',
    'SW-INV-2998',
    'vendor',
    'Sherwin-Williams',
    null,
    'b0000001-0000-4000-8000-000000006402',
    '6402-e-bambi-drive',
    null,
    'vendor:seed:' || to_char(current_date - 15, 'YYYYMMDD') || ':sw:2998',
    'paint',
    'ProMar 200 Zero VOC Primer & Sundries — 6402 Bambi',
    '[{"description": "ProMar 200 Zero VOC Interior Latex Primer (8x 5-Gal)", "trade": "paint", "qty": 8, "unitCents": 12000, "totalCents": 96000}]'::jsonb,
    current_date - 15,
    current_date - 2,
    96000,
    0,
    'paid',
    'not_required',
    'net_15',
    'Ilene',
    now() - interval '5 days',
    'Paid via company card.',
    'seed-cohesive'
  ),
  -- 10. Paid YTD sub bill (Mega Electrical on Monte Vista 5203)
  (
    'f1000001-0000-4000-8000-000000000010',
    'MVE-5203-04',
    'sub',
    'Mega Valley Electrical LLC (Synthetic)',
    'd0000001-0000-4000-8000-000000000002',
    'b0000001-0000-4000-8000-000000005203',
    '5203-n-monte-vista',
    null,
    null,
    'electrical',
    'Peter Rabbit Residence (5203) — Final Electrical Trim & Fixtures',
    '[{"description": "Electrical Trim Out & Lighting Package", "trade": "electrical", "qty": 1, "unitCents": 1680000, "totalCents": 1680000}]'::jsonb,
    date '2026-06-10',
    date '2026-06-20',
    1680000,
    0,
    'paid',
    'final_received',
    'friday_run',
    'Marco',
    timestamptz '2026-06-18 16:00:00-07',
    'Final waiver collected and filed.',
    'seed-cohesive'
  );

insert into public.bill_payments (
  id, bill_id, paid_on, amount_cents, fee_cents, method, reference, waiver_collected, recorded_by, note
)
values
  (
    'f2000001-0000-4000-8000-000000000001',
    'f1000001-0000-4000-8000-000000000004',
    current_date - 4,
    575000,
    0,
    'check',
    'CHK-4418',
    true,
    'seed-cohesive',
    '50% progress draw check #4418 on Powell paint package'
  ),
  (
    'f2000001-0000-4000-8000-000000000002',
    'f1000001-0000-4000-8000-000000000008',
    current_date - 9,
    1420000,
    0,
    'melio',
    'MELIO-OUT-98214',
    true,
    'seed-cohesive',
    'Melio ACH release to Medina Pro Drywall'
  ),
  (
    'f2000001-0000-4000-8000-000000000003',
    'f1000001-0000-4000-8000-000000000009',
    current_date - 2,
    96000,
    0,
    'card',
    'AMEX-8812',
    false,
    'seed-cohesive',
    'Paid Sherwin-Williams invoice #2998'
  ),
  (
    'f2000001-0000-4000-8000-000000000010',
    'f1000001-0000-4000-8000-000000000010',
    date '2026-06-19',
    1680000,
    0,
    'melio',
    'MELIO-OUT-74102',
    true,
    'seed-cohesive',
    'Final payment to Mega Valley Electrical on 5203 Monte Vista'
  );

-- ---------------------------------------------------------------------------
-- 7. AR Documents (`documents`), Proof Events (`document_events`), and Payments (`payments`)
-- ---------------------------------------------------------------------------
-- Note: `documents` has a freeze trigger on issued rows and `payments`/`document_events` are append-only,
-- so we use deterministic UUIDs with ON CONFLICT DO NOTHING.

insert into public.documents (
  id, kind, job_id, client_id, number, title, status, revision,
  snapshot, total_cents, due_date, token, preview_token, issued_at, issued_by, created_by
)
values
  -- 1. AFT Jury 8009-13 (Issued this month, viewed, partially paid via Melio)
  (
    'a1000001-0000-4000-8000-000000008013',
    'invoice',
    'b0000001-0000-4000-8000-000000008009',
    'c0000001-0000-4000-8000-000000000001',
    '8009-13',
    'Jury Residence (AFT 123) — Structural Framing & Insulation Draw #13',
    'issued',
    1,
    '{"lines": [{"description": "Structural & Steel Stud Framing (Progress to 85%)", "totalCents": 2120000}, {"description": "Thermal & Sound Batt Insulation", "totalCents": 720000}], "waiver": {"kind": "conditional_progress", "amountCents": 2840000, "jobCode": "AFT123-8009-13", "signed": true}}'::jsonb,
    2840000,
    current_date + 3,
    'tok_seed_8009_13_a1b2c3d4',
    'aa000000000000000000000000800913',
    now() - interval '8 days',
    'Marco',
    'seed-cohesive'
  ),
  -- 2. AFT Jury 8009-14 (Issued WTD, viewed, open for 23rd cutoff draw)
  (
    'a1000001-0000-4000-8000-000000008014',
    'invoice',
    'b0000001-0000-4000-8000-000000008009',
    'c0000001-0000-4000-8000-000000000001',
    '8009-14',
    'Jury Residence (AFT 123) — Level 5 Drywall & Gallery Skim Draw #14',
    'issued',
    1,
    '{"lines": [{"description": "Level 5 Drywall Hang & Skim Coat (Gallery & Primary)", "totalCents": 1975000}], "waiver": {"kind": "conditional_progress", "amountCents": 1975000, "jobCode": "AFT123-8009-14", "signed": true}}'::jsonb,
    1975000,
    current_date + 10,
    'tok_seed_8009_14_a1b2c3d4',
    'aa000000000000000000000000800914',
    now() - interval '1 day',
    'Marco',
    'seed-cohesive'
  ),
  -- 3. AFT Jury Change Order CO-3 (Issued Today)
  (
    'a1000001-0000-4000-8000-000000008093',
    'change_order',
    'b0000001-0000-4000-8000-000000008009',
    'c0000001-0000-4000-8000-000000000001',
    'CO-3',
    'CO-3 — 8009 N Ironwood Dr — Theater Acoustic Floating Soffit & Backing',
    'issued',
    1,
    '{"lines": [{"description": "Framing & Resilient Channel for Theater Floating Soffit", "totalCents": 890000}, {"description": "2 Layers 5/8 QuietRock + Level 5 Skim (incl. 15% GC markup cap)", "totalCents": 530000}]}'::jsonb,
    1420000,
    current_date + 7,
    'tok_seed_8009_co3_a1b2c3d4',
    'aa000000000000000000000000800993',
    now() - interval '3 hours',
    'Marco',
    'seed-cohesive'
  ),
  -- 4. AFT Jury 8009-15 (Draft invoice prepared for Friday cutoff — waiver pending)
  (
    'a1000001-0000-4000-8000-000000008015',
    'invoice',
    'b0000001-0000-4000-8000-000000008009',
    'c0000001-0000-4000-8000-000000000001',
    '8009-15',
    'Jury Residence (AFT 123) — CO-3 Billing & Workout Room Draw #15',
    'draft',
    1,
    '{"lines": [{"description": "CO-3 Theater Acoustic Floating Soffit (100%)", "totalCents": 1420000}, {"description": "Minor extra: relocate gym mirror blocking", "totalCents": 65000}], "waiver": {"kind": "conditional_progress", "amountCents": 0, "signed": false}}'::jsonb,
    1485000,
    current_date + 14,
    null,
    'aa000000000000000000000000800915',
    null,
    '',
    'seed-cohesive'
  ),
  -- 5. AFT Peter Rabbit 5203-11 (Issued & Paid via Melio with 1% fee)
  (
    'a1000001-0000-4000-8000-000000005211',
    'invoice',
    'b0000001-0000-4000-8000-000000005203',
    'c0000001-0000-4000-8000-000000000001',
    '5203-11',
    'Peter Rabbit Residence (AFT 125) — Casita & Main Trim Draw #11',
    'issued',
    1,
    '{"lines": [{"description": "Casita Drywall, Trim & Cleanup Draw", "totalCents": 3119640}], "waiver": {"kind": "conditional_progress", "amountCents": 3119640, "signed": true}}'::jsonb,
    3119640,
    current_date - 25,
    'tok_seed_5203_11_a1b2c3d4',
    'aa000000000000000000000000520311',
    now() - interval '35 days',
    'Marco',
    'seed-cohesive'
  ),
  -- 6. AFT Carder 4125-03 (Issued 4 days ago, NOT viewed -> Unconfirmed receipt alert)
  (
    'a1000001-0000-4000-8000-000000004103',
    'invoice',
    'b0000001-0000-4000-8000-000000004125',
    'c0000001-0000-4000-8000-000000000001',
    '4125-03',
    'Carder Remodel (AFT 129) — Framing & Demo Progress Draw #3',
    'issued',
    1,
    '{"lines": [{"description": "Selective Demo & Structural Framing (50%)", "totalCents": 1890000}], "waiver": {"kind": "conditional_progress", "amountCents": 1890000, "signed": true}}'::jsonb,
    1890000,
    current_date + 6,
    'tok_seed_4125_03_a1b2c3d4',
    'aa000000000000000000000000412503',
    now() - interval '4 days',
    'Marco',
    'seed-cohesive'
  ),
  -- 7. Schifferer Bellevue 9146-01 (Pay-when-paid, 10% retainage, submitted on Built portal)
  (
    'a1000001-0000-4000-8000-000000009101',
    'invoice',
    'b0000001-0000-4000-8000-000000009146',
    'c0000001-0000-4000-8000-000000000002',
    '9146-01',
    'Bellevue Heights Church AC938 — Pay Application #1 (Net of 10% Retainage)',
    'issued',
    1,
    '{"lines": [{"description": "Metal Stud Framing & Shaft Wall (45%)", "totalCents": 5333333}, {"description": "Less 10% Retainage Held", "totalCents": -533333}], "retainageCents": 533333, "waiver": {"kind": "conditional_progress", "amountCents": 4800000, "signed": true}}'::jsonb,
    4800000,
    null, -- Pay-when-paid: no fixed due date until GC draw lands
    'tok_seed_9146_01_a1b2c3d4',
    'aa000000000000000000000000914601',
    now() - interval '12 days',
    'Marco',
    'seed-cohesive'
  ),
  -- 8. Powell 3526-08 (Issued WTD, partially paid today)
  (
    'a1000001-0000-4000-8000-000000003508',
    'invoice',
    'b0000001-0000-4000-8000-000000003526',
    'c0000001-0000-4000-8000-000000000003',
    '3526-08',
    '3526 Emerson Street (Powell) — SOV Progress Payment Draw #8',
    'issued',
    1,
    '{"lines": [{"description": "Drywall Hang & Level 4 Finish (Progress to 75%)", "totalCents": 2450000}, {"description": "Casita Interior Trim & Paint (Progress to 45%)", "totalCents": 1400000}]}'::jsonb,
    3850000,
    current_date + 5,
    'tok_seed_3526_08_a1b2c3d4',
    'aa000000000000000000000000352608',
    now() - interval '1 day',
    'Marco',
    'seed-cohesive'
  ),
  -- 9. Woodward 6402-02 (9 days past due -> Ilene +7d call step)
  (
    'a1000001-0000-4000-8000-000000006402',
    'invoice',
    'b0000001-0000-4000-8000-000000006402',
    'c0000001-0000-4000-8000-000000000004',
    '6402-02',
    '6402 E Bambi Drive (Woodward) — Framing Complete & Drywall Hang Draw #2',
    'issued',
    1,
    '{"lines": [{"description": "Addition Framing 100% Complete", "totalCents": 2370000}, {"description": "Drywall Hang & Tape (60%)", "totalCents": 1800000}]}'::jsonb,
    4170000,
    current_date - 9,
    'tok_seed_6402_02_a1b2c3d4',
    'aa000000000000000000000000640202',
    now() - interval '16 days',
    'Marco',
    'seed-cohesive'
  ),
  -- 10. McHugh 12729-04 (18 days past due -> Marco +14d call & 5-day notice step)
  (
    'a1000001-0000-4000-8000-000000012704',
    'invoice',
    'b0000001-0000-4000-8000-000000012729',
    'c0000001-0000-4000-8000-000000000005',
    '12729-04',
    '12729 W Keim Dr (McHugh) — Structural Framing & Sheathing Draw #4',
    'issued',
    1,
    '{"lines": [{"description": "Structural Framing & Roof Sheathing (85%)", "totalCents": 2940000}]}'::jsonb,
    2940000,
    current_date - 18,
    'tok_seed_12729_04_a1b2c3d4',
    'aa000000000000000000000000127204',
    now() - interval '25 days',
    'Marco',
    'seed-cohesive'
  ),
  -- 11. Powell 3526-06 (Issued & Paid earlier in YTD)
  (
    'a1000001-0000-4000-8000-000000003506',
    'invoice',
    'b0000001-0000-4000-8000-000000003526',
    'c0000001-0000-4000-8000-000000000003',
    '3526-06',
    '3526 Emerson Street (Powell) — SOV Progress Payment Draw #6',
    'issued',
    1,
    '{"lines": [{"description": "Main Residence Structural Framing Complete", "totalCents": 6400000}]}'::jsonb,
    6400000,
    date '2026-05-15',
    'tok_seed_3526_06_a1b2c3d4',
    'aa000000000000000000000000352606',
    timestamptz '2026-05-08 10:00:00-07',
    'Marco',
    'seed-cohesive'
  )
on conflict (id) do nothing;

-- Proof record events (`document_events`) with `dedupe` keys for idempotence
insert into public.document_events (document_id, kind, at, actor, automatic, dedupe, detail)
values
  ('a1000001-0000-4000-8000-000000008013', 'sent', now() - interval '8 days', 'marco@saddlewoodcontracting.com', false, 'seed-ev-8013-sent', '{"to": ["ap.aft@example.com"], "cc": ["pm.aft@example.com"], "attachments": ["Invoice-8009-13.pdf", "AFT-Waiver-8009-13.pdf"]}'::jsonb),
  ('a1000001-0000-4000-8000-000000008013', 'delivered', now() - interval '8 days' + interval '12 seconds', 'resend', true, 'seed-ev-8013-deliv', '{"to": "ap.aft@example.com"}'::jsonb),
  ('a1000001-0000-4000-8000-000000008013', 'viewed', now() - interval '7 days', 'client', false, 'seed-ev-8013-view', '{"ip": "198.51.100.42", "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}'::jsonb),
  ('a1000001-0000-4000-8000-000000008014', 'sent', now() - interval '1 day', 'marco@saddlewoodcontracting.com', false, 'seed-ev-8014-sent', '{"to": ["ap.aft@example.com"], "cc": ["pm.aft@example.com"], "attachments": ["Invoice-8009-14.pdf", "AFT-Waiver-8009-14.pdf"]}'::jsonb),
  ('a1000001-0000-4000-8000-000000008014', 'viewed', now() - interval '18 hours', 'client', false, 'seed-ev-8014-view', '{"ip": "198.51.100.42", "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X)"}'::jsonb),
  ('a1000001-0000-4000-8000-000000004103', 'sent', now() - interval '4 days', 'marco@saddlewoodcontracting.com', false, 'seed-ev-4103-sent', '{"to": ["ap.aft@example.com"]}'::jsonb),
  ('a1000001-0000-4000-8000-000000004103', 'delivered', now() - interval '4 days' + interval '10 seconds', 'resend', true, 'seed-ev-4103-deliv', '{"to": "ap.aft@example.com"}'::jsonb),
  ('a1000001-0000-4000-8000-000000009101', 'portal_submitted', now() - interval '12 days', 'ilene8a@gmail.com', false, 'seed-ev-9101-portal', '{"portal": "Built", "reference": "PA-9146-001"}'::jsonb),
  ('a1000001-0000-4000-8000-000000003508', 'sent', now() - interval '1 day', 'marco@saddlewoodcontracting.com', false, 'seed-ev-3508-sent', '{"to": ["mark.powell@example.com"], "attachments": ["Powell_Progress_Tracker_3526-08.xlsx"]}'::jsonb),
  ('a1000001-0000-4000-8000-000000003508', 'viewed', now() - interval '12 hours', 'client', false, 'seed-ev-3508-view', '{"ip": "203.0.113.19", "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"}'::jsonb),
  ('a1000001-0000-4000-8000-000000006402', 'sent', now() - interval '16 days', 'marco@saddlewoodcontracting.com', false, 'seed-ev-6402-sent', '{"to": ["leila.woodward@example.com"]}'::jsonb),
  ('a1000001-0000-4000-8000-000000006402', 'viewed', now() - interval '14 days', 'client', false, 'seed-ev-6402-view', '{"ip": "203.0.113.88", "ua": "Mozilla/5.0 (iPhone)"}'::jsonb),
  ('a1000001-0000-4000-8000-000000012704', 'sent', now() - interval '25 days', 'marco@saddlewoodcontracting.com', false, 'seed-ev-12704-sent', '{"to": ["lindsay.mchugh@example.com"]}'::jsonb),
  ('a1000001-0000-4000-8000-000000012704', 'viewed', now() - interval '23 days', 'client', false, 'seed-ev-12704-view', '{"ip": "203.0.113.99", "ua": "Mozilla/5.0 (Macintosh)"}'::jsonb)
on conflict (dedupe) where dedupe is not null do nothing;

-- AR Payments (`payments` & `payment_allocations`) across Today, WTD, MTD, YTD
insert into public.payments (
  id, client_id, received_on, amount_cents, fee_cents, method, reference, note, evidence, recorded_by
)
values
  -- Today: Powell partial check payment on 3526-08
  (
    'a2000001-0000-4000-8000-000000000001',
    'c0000001-0000-4000-8000-000000000003',
    current_date,
    1850000,
    0,
    'check',
    'CHK-9042',
    'Initial check draw against 3526-08',
    'Check #9042 deposited by Ilene',
    'ilene8a@gmail.com'
  ),
  -- WTD / MTD: AFT Melio payment on 8009-13 (with 1% Melio fee)
  (
    'a2000001-0000-4000-8000-000000000002',
    'c0000001-0000-4000-8000-000000000001',
    current_date - 2,
    1500000,
    15000,
    'melio',
    'MELIO-IN-8009-13A',
    'AFT partial draw release via Melio ($15,000 gross, $150 Melio 1% fee)',
    'Melio email notification',
    'ilene8a@gmail.com'
  ),
  -- Earlier in MTD: AFT Melio payment on 5203-11 (paid in full with 1% fee)
  (
    'a2000001-0000-4000-8000-000000000003',
    'c0000001-0000-4000-8000-000000000001',
    current_date - 14,
    3119640,
    31196,
    'melio',
    'MELIO-IN-5203-11',
    'AFT full release on 5203-11 after conditional waiver receipt',
    'Melio email notification (Vanessa Winters)',
    'ilene8a@gmail.com'
  ),
  -- YTD: Powell Draw #6 paid in full
  (
    'a2000001-0000-4000-8000-000000000004',
    'c0000001-0000-4000-8000-000000000003',
    date '2026-05-14',
    6400000,
    0,
    'wire',
    'WIRE-20260514-POWELL',
    'Powell Draw #6 wire transfer',
    'Chase wire confirmation',
    'ilene8a@gmail.com'
  )
on conflict (id) do nothing;

insert into public.payment_allocations (id, payment_id, document_id, amount_cents)
values
  ('a3000001-0000-4000-8000-000000000001', 'a2000001-0000-4000-8000-000000000001', 'a1000001-0000-4000-8000-000000003508', 1850000),
  ('a3000001-0000-4000-8000-000000000002', 'a2000001-0000-4000-8000-000000000002', 'a1000001-0000-4000-8000-000000008013', 1500000),
  ('a3000001-0000-4000-8000-000000000003', 'a2000001-0000-4000-8000-000000000003', 'a1000001-0000-4000-8000-000000005211', 3119640),
  ('a3000001-0000-4000-8000-000000000004', 'a2000001-0000-4000-8000-000000000004', 'a1000001-0000-4000-8000-000000003506', 6400000)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Job Paperwork Watches (`job_watches`)
-- ---------------------------------------------------------------------------
insert into public.job_watches (job_id, kind, title, due_on, note, done_at, done_by, created_by)
values
  ('b0000001-0000-4000-8000-000000009146', 'agreement', 'Their subcontract signed', current_date - 30, 'Schifferer Built AC938 subcontract executed', now() - interval '30 days', 'Marco', 'seed-cohesive'),
  ('b0000001-0000-4000-8000-000000009146', 'coi_gc', 'Certificate of insurance sent to GC', current_date - 28, 'COI naming Schifferer Built sent', now() - interval '28 days', 'Ilene', 'seed-cohesive'),
  ('b0000001-0000-4000-8000-000000009146', 'prelim_notice', 'Arizona 20-day preliminary notice served', current_date + 4, 'Prepare & verify AZ 20-day preliminary notice for Bellevue AC938', null, '', 'seed-cohesive'),
  ('b0000001-0000-4000-8000-000000008009', 'prelim_notice', 'Arizona 20-day preliminary notice served', current_date - 40, 'Served on AFT 123 Jury Residence', now() - interval '40 days', 'Ilene', 'seed-cohesive')
on conflict (job_id, kind) where kind not in ('permit', 'custom') do nothing;

-- ---------------------------------------------------------------------------
-- 9. Phase 2: Crew Schedule, Job Phases, Schedule Items, Checklists, EOD Logs, Field Receipts & Punch
-- ---------------------------------------------------------------------------

-- Crew schedule assignments (`crew_schedule`) across this week & next week
delete from public.crew_schedule where created_by = 'seed-cohesive';
insert into public.crew_schedule (day, email, job_id, job_name, start_time, note, priority, ack, created_by)
values
  (current_date, 'mateo.mujica.synth@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', '06:30', 'Franklin Hall East Classroom metal stud framing & shaft wall', 1, 'ok', 'seed-cohesive'),
  (current_date, 'arnoldo.mujica.synth@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', '06:30', 'Franklin Hall East Classroom metal stud framing', 1, 'ok', 'seed-cohesive'),
  (current_date, 'filiberto.villegas.synth@example.com', '8009-n-ironwood-dr', '8009 N Ironwood Dr (Jury AFT 123)', '07:00', 'Theater acoustic floating soffit framing & backing (CO-3)', 2, 'ok', 'seed-cohesive'),
  (current_date, 'juan.torres.synth@example.com', '6402-e-bambi-drive', '6402 E Bambi Drive (Woodward)', '07:00', 'Master bath & hallway 5/8 Type X hang', 2, 'ok', 'seed-cohesive'),
  (current_date, 'david.morales.synth@example.com', '6402-e-bambi-drive', '6402 E Bambi Drive (Woodward)', '07:00', 'Master bath & hallway fire tape & corner bead', 2, 'ok', 'seed-cohesive'),
  (current_date, 'jesus.mendoza.synth@example.com', '3526-emerson-street', '3526 Emerson Street (Powell)', '07:30', 'Casita & gallery Level 4 prime & satin finish coat', 3, 'ok', 'seed-cohesive'),
  (current_date + 1, 'mateo.mujica.synth@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', '06:30', 'Pre-cover framing walk & firestop backing', 1, 'ok', 'seed-cohesive'),
  (current_date + 1, 'carlos.habana.synth@example.com', '8009-n-ironwood-dr', '8009 N Ironwood Dr (Jury AFT 123)', '07:00', 'Gallery & Great Room Level 5 skim coat', 2, '', 'seed-cohesive'),
  (current_date + 2, 'mateo.mujica.synth@example.com', '4125-e-camelback-rd', '4125 E Camelback Rd (Carder AFT 129)', '07:00', 'Kitchen structural header & bearing wall framing', 2, '', 'seed-cohesive'),
  (current_date + 3, 'juan.torres.synth@example.com', '9146-w-hutton-dr', '9146 W Hutton Dr (Bellevue AC938)', '06:30', 'Classroom 5/8 XP Hi-Abuse board hang after insulation sign-off', 2, '', 'seed-cohesive')
on conflict (day, email, job_id) do update
  set start_time = excluded.start_time,
      note = excluded.note,
      priority = excluded.priority,
      ack = excluded.ack;

-- Job phases (`crew_job_phases`) for timeline & quality gates
delete from public.checklists where created_by = 'seed-cohesive';
delete from public.crew_job_phases where created_by = 'seed-cohesive';

insert into public.crew_job_phases (job_id, ord, name, trade, planned_from, planned_to, verified_by, verified_at, note, created_by)
values
  ('9146-w-hutton-dr', 1, 'Layout & Top Track', 'framing', current_date - 14, current_date - 7, 'Eli Ramirez', now() - interval '7 days', 'Verified layout with Schifferer super', 'seed-cohesive'),
  ('9146-w-hutton-dr', 2, 'Structural Studs & 2-Hr Shaft Wall', 'framing', current_date - 6, current_date + 1, '', null, 'In progress — pre-cover checklist open on Classroom 102', 'seed-cohesive'),
  ('9146-w-hutton-dr', 3, 'Sound & Thermal Batt Insulation', 'insulation', current_date + 2, current_date + 5, '', null, 'Sonoran Thermal scheduled after framing pre-cover', 'seed-cohesive'),
  ('9146-w-hutton-dr', 4, 'Hang 5/8 XP Hi-Abuse Drywall', 'drywall', current_date + 6, current_date + 12, '', null, '', 'seed-cohesive'),
  ('8009-n-ironwood-dr', 1, 'Structural Framing & Sheathing', 'framing', current_date - 35, current_date - 20, 'Eli Ramirez', now() - interval '20 days', 'Verified & passed framing inspection', 'seed-cohesive'),
  ('8009-n-ironwood-dr', 2, 'Hang & Tape', 'drywall', current_date - 19, current_date - 5, 'Eli Ramirez', now() - interval '5 days', 'Verified pre-board & pre-tape', 'seed-cohesive'),
  ('8009-n-ironwood-dr', 3, 'Level 5 Skim & Theater Soffit (CO-3)', 'drywall', current_date - 4, current_date + 3, '', null, 'Gallery skim 85% complete; Theater floating soffit framing today', 'seed-cohesive'),
  ('6402-e-bambi-drive', 1, 'Addition Framing & Backing', 'framing', current_date - 21, current_date - 8, 'Eli Ramirez', now() - interval '8 days', 'Verified all bath backing', 'seed-cohesive'),
  ('6402-e-bambi-drive', 2, 'Drywall Hang & Fire Tape', 'drywall', current_date - 7, current_date + 2, '', null, 'Active hang & tape in master suite', 'seed-cohesive'),
  ('3526-emerson-street', 1, 'Framing & Drywall', 'drywall', current_date - 45, current_date - 15, 'Marco', now() - interval '15 days', 'Verified complete', 'seed-cohesive'),
  ('3526-emerson-street', 2, 'Interior Prime, Finish Paint & Trim', 'paint', current_date - 14, current_date + 4, '', null, 'Casita & main gallery finish coat in progress', 'seed-cohesive');

-- Schedule items (`schedule_items`: inspections, site visits, deliveries, meetings, sub mobilizations)
delete from public.schedule_items where created_by = 'seed-cohesive';
insert into public.schedule_items (
  kind, title, detail, job_id, crew_job_id, sub_id, start_day, end_day, start_time, role, who, status, created_by
)
values
  (
    'inspection',
    'City of Phoenix — 2-Hr Shaft Wall & Framing Pre-Cover Inspection',
    'Inspector meeting at Franklin Hall East entrance; requires signed pre-cover checklist.',
    'b0000001-0000-4000-8000-000000009146',
    '9146-w-hutton-dr',
    null,
    current_date + 1,
    current_date + 1,
    '09:30',
    'pm',
    'Eli Ramirez',
    'scheduled',
    'seed-cohesive'
  ),
  (
    'delivery',
    'Arizona Building Supply — 110 Sheets 5/8 XP Hi-Abuse Drywall Boom Drop',
    'Boom truck staging on Hutton Dr north gate; runner & forklift on site.',
    'b0000001-0000-4000-8000-000000009146',
    '9146-w-hutton-dr',
    null,
    current_date,
    current_date,
    '07:00',
    'field_lead',
    'Mateo Mujica',
    'done',
    'seed-cohesive'
  ),
  (
    'sub_mobilization',
    'Sonoran Thermal Insulation — Classroom R-19 & Sound Batt Mobilization',
    '4-man insulation crew mobilizing to Franklin Hall (contingent on COI renewal).',
    'b0000001-0000-4000-8000-000000009146',
    '9146-w-hutton-dr',
    'd0000001-0000-4000-8000-000000000003',
    current_date + 2,
    current_date + 5,
    '07:00',
    'pm',
    'Eli Ramirez',
    'scheduled',
    'seed-cohesive'
  ),
  (
    'site_visit',
    'AFT Super + Marco — Jury Residence Theater Soffit & Level 5 Light Check',
    'Walk CO-3 floating soffit framing and raking-light check on Gallery Level 5 walls.',
    'b0000001-0000-4000-8000-000000008009',
    '8009-n-ironwood-dr',
    null,
    current_date + 1,
    current_date + 1,
    '14:00',
    'decisions',
    'Marco',
    'scheduled',
    'seed-cohesive'
  ),
  (
    'inspection',
    'Town of Paradise Valley — Drywall Nail/Screw Inspection',
    'Master Suite & Addition firewall screw pattern inspection before tape.',
    'b0000001-0000-4000-8000-000000006402',
    '6402-e-bambi-drive',
    null,
    current_date,
    current_date,
    '11:00',
    'pm',
    'Eli Ramirez',
    'scheduled',
    'seed-cohesive'
  ),
  (
    'meeting',
    'Powell Weekly Owner Selection & SOV Progress Walk',
    'Review Draw #8 progress and casita cabinet/trim paint sheen with Mark & Heather Powell.',
    'b0000001-0000-4000-8000-000000003526',
    '3526-emerson-street',
    null,
    current_date + 3,
    current_date + 3,
    '10:00',
    'decisions',
    'Marco',
    'scheduled',
    'seed-cohesive'
  );

-- Pre-cover & phase quality checklists (`checklists`, SOP-009 quality gate)
insert into public.checklists (
  job_id, phase_id, stage, location_label, items, status, note, completed_by, completed_at, created_by
)
select
  '9146-w-hutton-dr',
  p.id,
  'pre_cover',
  'Franklin Hall Classroom 102 — North/South & 2-Hr Shaft Wall (Both Faces)',
  '[{"key":"studs_backing","label":"Stud spacing, heavy-gauge door bucks & TV/cabinet backing verified","checked":true,"note":"16 OC 20-ga verified"},{"key":"mep_clearance","label":"MEP rough-in plates, nail guards & acoustic putty pads installed","checked":true,"note":""},{"key":"firestop","label":"Top-of-wall fire caulk & 2-hr shaft liner clips inspected","checked":false,"note":"Waiting on East corridor penetration sleeve"},{"key":"both_faces_photo","label":"Photos captured of both wall faces with room label visible","checked":false,"note":"North face photographed; South face pending"}]'::jsonb,
  'open',
  'Blocks verifying Structural Studs & 2-Hr Shaft Wall until firestop sleeve & south face photo are checked.',
  '',
  null,
  'seed-cohesive'
from public.crew_job_phases p
where p.job_id = '9146-w-hutton-dr' and p.ord = 2
limit 1;

insert into public.checklists (
  job_id, phase_id, stage, location_label, items, status, note, completed_by, completed_at, created_by
)
select
  '8009-n-ironwood-dr',
  p.id,
  'pre_paint',
  'Main Gallery & Theater Entry — Level 5 Skim Raking-Light Check (Both Faces)',
  '[{"key":"skim_holiday","label":"Zero holidays, lap marks or pinholes under 500W raking light","checked":true,"note":"Checked with Carlos"},{"key":"corner_bead","label":"Trim-Tex tear-away L-bead & reveal beads laser-straight","checked":true,"note":""},{"key":"sanded_dusted","label":"Walls vacuum-sanded and wiped ready for PVA primer","checked":true,"note":""},{"key":"both_faces_photo","label":"Photos captured of both wall faces with room label visible","checked":true,"note":"Uploaded in EOD log"}]'::jsonb,
  'passed',
  'Gallery walls passed raking-light check; Theater soffit framing in progress.',
  'Eli Ramirez',
  now() - interval '3 hours',
  'seed-cohesive'
from public.crew_job_phases p
where p.job_id = '8009-n-ironwood-dr' and p.ord = 3
limit 1;

-- Structured Daily Logs (`crew_entries` kind='eod') & Field Receipts (`kind='receipt'`)
delete from public.crew_entries where client_id like 'seed-cohesive-%';
insert into public.crew_entries (
  email, kind, day, job_id, job_name, body, data, files, status, decided_by, client_id
)
values
  (
    'mateo.mujica.synth@example.com',
    'eod',
    current_date,
    '9146-w-hutton-dr',
    '9146 W Hutton Dr (Bellevue AC938)',
    'Framed 85 LF of 20-ga 3-5/8 classroom partitions in Franklin Hall 102–104 and set HM door frames.',
    '{"weather":"Sunny 88°F","crewCount":3,"tradesOnSite":"Framing, Electrical","deliveries":"Arizona Building Supply delivered 110 sheets 5/8 XP Hi-Abuse","visits":"Schifferer assistant super walked shaft wall layout","inspections":"Pre-cover framing inspection scheduled tomorrow 9:30 AM","asked":"Schifferer asked to add 24 LF of 16-ga projector backing in Lecture Hall 101","decision":"ASK: Confirm whether Lecture Hall 101 backing is billed on T&M or folded into CO-1","stuck":"East corridor MEP sleeve still open on Classroom 102 shaft wall","needs":"","safety":"All scissor lift harnesses and toe-boards checked"}'::jsonb,
    '[{"name":"bellevue-102-north-wall.jpg","path":"u/mateo/bellevue-102-north.jpg","type":"image/jpeg","size":184200},{"name":"bellevue-102-south-wall.jpg","path":"u/mateo/bellevue-102-south.jpg","type":"image/jpeg","size":179400},{"name":"bellevue-delivery-drop.jpg","path":"u/mateo/bellevue-drop.jpg","type":"image/jpeg","size":210000}]'::jsonb,
    'filed',
    'Eli Ramirez',
    'seed-cohesive-eod-9146-today'
  ),
  (
    'filiberto.villegas.synth@example.com',
    'eod',
    current_date,
    '8009-n-ironwood-dr',
    '8009 N Ironwood Dr (Jury AFT 123)',
    'Completed Theater floating acoustic soffit framing and LED cove backing per CO-3.',
    '{"weather":"Clear 87°F","crewCount":2,"tradesOnSite":"Framing, Drywall, Low-Voltage","deliveries":"None","visits":"AFT project manager checked theater soffit height","inspections":"Ready for AFT walk tomorrow at 2:00 PM","asked":"","decision":"","stuck":"","needs":"","safety":"No incidents"}'::jsonb,
    '[{"name":"jury-theater-soffit-1.jpg","path":"u/filiberto/jury-soffit-1.jpg","type":"image/jpeg","size":165000},{"name":"jury-theater-soffit-2.jpg","path":"u/filiberto/jury-soffit-2.jpg","type":"image/jpeg","size":172000},{"name":"jury-gallery-level5.jpg","path":"u/filiberto/jury-gallery.jpg","type":"image/jpeg","size":191000}]'::jsonb,
    'filed',
    'Eli Ramirez',
    'seed-cohesive-eod-8009-today'
  ),
  (
    'juan.torres.synth@example.com',
    'receipt',
    current_date,
    '6402-e-bambi-drive',
    '6402 E Bambi Drive (Woodward)',
    '2 boxes 1-5/8 coarse drywall screws + fiberglass mesh tape (paid out of pocket)',
    '{"amount":84.50,"vendor":"Home Depot","paidBy":"me","trade":"drywall","normalizedPurchaseKey":"app:seed:receipt-6402-1"}'::jsonb,
    '[{"name":"hd-receipt-6402.jpg","path":"u/juan/hd-receipt-6402.jpg","type":"image/jpeg","size":94000}]'::jsonb,
    'approved',
    'Eli Ramirez',
    'seed-cohesive-receipt-6402-1'
  );

-- Normalized app receipt in `purchases` + worker reimbursement in `bills`
insert into public.purchases (
  source, source_key, purchased_on, vendor, store, order_ref,
  job_name_raw, job_key, job_id, trade, trade_manual,
  department, class, sku, description, qty, line_total_cents, meta
)
values (
  'app',
  'app:seed:receipt-6402-1',
  current_date,
  'Home Depot',
  'Field Receipt (App)',
  'REC-6402-1',
  '6402 E Bambi Drive (Woodward)',
  '6402 e bambi drive woodward',
  '6402-e-bambi-drive',
  'drywall',
  true,
  'BLDG. MATERIALS',
  'GYPSUM',
  'FIELD-REC',
  '2 boxes 1-5/8 coarse drywall screws + fiberglass mesh tape (paid out of pocket)',
  1,
  8450,
  '{"runner":"Juan Torres","paidBy":"me","clientId":"seed-cohesive-receipt-6402-1"}'::jsonb
)
on conflict (source_key) do nothing;

insert into public.bills (
  id, bill_number, kind, vendor_name, sub_id, job_id, crew_job_id, bid_package_id, purchase_trip_key,
  trade, description, lines, issued_on, due_on, amount_cents, retainage_cents,
  status, waiver_status, payment_terms, approved_by, approved_at, note, created_by
)
values (
  'f1000001-0000-4000-8000-000000000011',
  'REIMB-6402-1',
  'reimbursement',
  'Juan Torres (Crew Reimbursement)',
  null,
  'b0000001-0000-4000-8000-000000006402',
  '6402-e-bambi-drive',
  null,
  'app:seed:receipt-6402',
  'drywall',
  'Out-of-pocket field receipt: 2 boxes 1-5/8 drywall screws + mesh tape',
  '[{"description":"2 boxes 1-5/8 coarse drywall screws + fiberglass mesh tape","trade":"drywall","qty":1,"unitCents":8450,"totalCents":8450}]'::jsonb,
  current_date,
  current_date + 3,
  8450,
  0,
  'open',
  'not_required',
  'friday_run',
  'Eli Ramirez',
  now() - interval '1 hour',
  'Normalized from field receipt app:seed:receipt-6402-1 (paidBy=me).',
  'seed-cohesive'
)
on conflict (id) do nothing;

-- Punch items, CO intake & Decision items in `work_items`
delete from public.work_items where created_by = 'seed-cohesive';
insert into public.work_items (
  kind, title, detail, location, role, assignee, job_id, crew_job_id, due_on, escalate_days, status, source, href, created_by
)
values
  (
    'punch',
    'Touch up Level 5 skim coat holiday at East gallery clerestory window return',
    'Marked with blue tape during raking-light walk; skim & sand before primer.',
    'Gallery — East Clerestory Window Return',
    'field_lead',
    'carlos.habana.synth@example.com',
    'b0000001-0000-4000-8000-000000008009',
    '8009-n-ironwood-dr',
    current_date + 1,
    1,
    'open',
    'seed:punch:8009:1',
    '/app/jobs/8009-n-ironwood-dr?tab=log',
    'seed-cohesive'
  ),
  (
    'punch',
    'Install firestop putty pad & acoustic sealant at Classroom 102 East shaft sleeve',
    'Required to pass pre-cover checklist before tomorrow 9:30 AM inspection.',
    'Franklin Hall Classroom 102 — East Shaft Wall',
    'field_lead',
    'mateo.mujica.synth@example.com',
    'b0000001-0000-4000-8000-000000009146',
    '9146-w-hutton-dr',
    current_date,
    1,
    'open',
    'seed:punch:9146:1',
    '/app/jobs/9146-w-hutton-dr?tab=log',
    'seed-cohesive'
  ),
  (
    'punch',
    'Caulk & spray 2nd finish coat on Casita south pocket door casing',
    'Owner walk item ahead of Draw #8 closeout.',
    'Casita — South Pocket Door Casing',
    'field_lead',
    'jesus.mendoza.synth@example.com',
    'b0000001-0000-4000-8000-000000003526',
    '3526-emerson-street',
    current_date + 2,
    1,
    'open',
    'seed:punch:3526:1',
    '/app/jobs/3526-emerson-street?tab=log',
    'seed-cohesive'
  ),
  (
    'co_price',
    'CO awaiting price · 9146 W Hutton Dr: Add 24 LF of 16-ga projector backing in Lecture Hall 101',
    'Captured from Mateo Mujica EOD directive (Schifferer super request). Price before Friday cutoff.',
    'Lecture Hall 101 — North Wall',
    'sales',
    '',
    'b0000001-0000-4000-8000-000000009146',
    '9146-w-hutton-dr',
    current_date - 3,
    2,
    'open',
    'seed:eod:asked:9146',
    '/app/jobs/9146-w-hutton-dr?tab=changes',
    'seed-cohesive'
  ),
  (
    'decision',
    'ASK · 9146 W Hutton Dr: Confirm whether Lecture Hall 101 backing is T&M or folded into CO-1',
    'Rule? Logged from Mateo EOD check-in.',
    'Lecture Hall 101',
    'decisions',
    '',
    'b0000001-0000-4000-8000-000000009146',
    '9146-w-hutton-dr',
    current_date,
    1,
    'open',
    'seed:eod:decision:9146',
    '/app/jobs/9146-w-hutton-dr?tab=log',
    'seed-cohesive'
  );

commit;
