-- Check for 0056's jobs_client_mirror and link_client_records step 4, run
-- after 0056 is applied: psql "$DB" -v ON_ERROR_STOP=1 -f supabase/checks/0056_jobs_client_mirror.sql
-- It copies the installed functions into a scratch schema with its own
-- tables, so it reads nothing real and writes nothing real, and it rolls
-- back. A failed case raises and psql exits non-zero.
begin;

create schema chk0056;
create table chk0056.clients (id uuid primary key, name text not null);
create table chk0056.client_contacts (id uuid primary key, client_id uuid not null, name text not null default '',
  email text not null default '', phone text not null default '', active boolean not null default true,
  created_at timestamptz not null default now());
create table chk0056.jobs (id uuid primary key, client_id uuid, client_name text, client_email text, client_phone text, contact_id uuid);
create table chk0056.sales_opportunities (id uuid primary key, job_id uuid, client_id uuid, contact_id uuid, contact jsonb);

do $$
declare f text;
begin
  foreach f in array array['public.client_contact_match(uuid, text, text)', 'public.jobs_client_mirror()', 'public.link_client_records()'] loop
    execute replace(pg_get_functiondef(f::regprocedure), 'public.', 'chk0056.');
  end loop;
end $$;
create trigger jobs_client_mirror before insert or update on chk0056.jobs
  for each row execute function chk0056.jobs_client_mirror();

insert into chk0056.clients values ('00000000-0000-4000-8000-0000000000c1', 'Patrick Homes');
insert into chk0056.client_contacts (id, client_id, name, email, phone, created_at) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000c1', 'Ann', 'ann@example.com', '', '2026-10-01'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000c1', 'Ben', '', '602-555-0102', '2026-10-02');

create function chk0056.expect(what text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', what, got, want; end if;
  raise notice 'ok  %', what;
end $$;

do $$
declare j chk0056.jobs;
begin
  -- A new job linked to Ben: Ben's details, his empty email too (nothing typed survives).
  insert into chk0056.jobs values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', '', 'typed@example.com', '480-555-0000', '00000000-0000-4000-8000-00000000000b')
    returning * into j;
  perform chk0056.expect('insert: email is the record''s (empty -> null)', j.client_email, null);
  perform chk0056.expect('insert: phone is the record''s', j.client_phone, '602-555-0102');

  -- Same person (Ben), an email typed on the job: the record has none, so it stands.
  update chk0056.jobs set client_email = 'kept@example.com' where id = j.id returning * into j;
  perform chk0056.expect('same contact: typed email stands where the record has none', j.client_email, 'kept@example.com');
  perform chk0056.expect('same contact: phone still the record''s', j.client_phone, '602-555-0102');

  -- Another person (Ann, no phone): never Ben's phone left behind.
  update chk0056.jobs set contact_id = '00000000-0000-4000-8000-00000000000a' where id = j.id returning * into j;
  perform chk0056.expect('changed contact: email is the new record''s', j.client_email, 'ann@example.com');
  perform chk0056.expect('changed contact: the old person''s phone is dropped', j.client_phone, null);

  -- Back to Ben: Ann's email does not stay.
  update chk0056.jobs set contact_id = '00000000-0000-4000-8000-00000000000b' where id = j.id returning * into j;
  perform chk0056.expect('changed back: the old person''s email is dropped', j.client_email, null);
end $$;

-- link_client_records step 4 links a job only where the record's empty value
-- would not wipe one the job has.
insert into chk0056.jobs values
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', '', 'ann@example.com', '480-555-0002', null),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c1', '', 'ann@example.com', '', null),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000c1', '', 'own@example.com', '', null),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000c1', '', '', '', null);
insert into chk0056.sales_opportunities values
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000b', '{}'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000b', '{}');
select chk0056.link_client_records();

do $$
declare j chk0056.jobs;
begin
  select * into j from chk0056.jobs where id = '00000000-0000-4000-8000-0000000000e2';
  perform chk0056.expect('link by email: a job phone the record lacks is not wiped (not linked)', j.contact_id::text, null);
  perform chk0056.expect('link by email: its phone stays', j.client_phone, '480-555-0002');
  select * into j from chk0056.jobs where id = '00000000-0000-4000-8000-0000000000e3';
  perform chk0056.expect('link by email: nothing to lose, linked', j.contact_id::text, '00000000-0000-4000-8000-00000000000a');
  select * into j from chk0056.jobs where id = '00000000-0000-4000-8000-0000000000e4';
  perform chk0056.expect('link from lead: a job email the record lacks is not wiped (not linked)', j.contact_id::text, null);
  perform chk0056.expect('link from lead: its email stays', j.client_email, 'own@example.com');
  select * into j from chk0056.jobs where id = '00000000-0000-4000-8000-0000000000e5';
  perform chk0056.expect('link from lead: nothing to lose, linked', j.contact_id::text, '00000000-0000-4000-8000-00000000000b');
  perform chk0056.expect('link from lead: takes the record''s phone', j.client_phone, '602-555-0102');
end $$;

rollback;
