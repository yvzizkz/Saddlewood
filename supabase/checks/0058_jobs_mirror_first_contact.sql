-- Check for 0058's jobs_client_mirror, run after 0058 is applied:
-- psql "$DB" -v ON_ERROR_STOP=1 -f supabase/checks/0058_jobs_mirror_first_contact.sql
-- Like 0056's check, it copies the installed function into a scratch schema
-- with its own tables, so it reads nothing real and writes nothing real, and
-- it rolls back. A failed case raises and psql exits non-zero.
begin;

create schema chk0058;
create table chk0058.clients (id uuid primary key, name text not null);
create table chk0058.client_contacts (id uuid primary key, client_id uuid not null, name text not null default '',
  email text not null default '', phone text not null default '');
create table chk0058.jobs (id uuid primary key, client_id uuid, client_name text, client_email text, client_phone text, contact_id uuid);

do $$
begin
  execute replace(pg_get_functiondef('public.jobs_client_mirror()'::regprocedure), 'public.', 'chk0058.');
end $$;
create trigger jobs_client_mirror before insert or update on chk0058.jobs
  for each row execute function chk0058.jobs_client_mirror();

insert into chk0058.clients values ('00000000-0000-4000-8000-0000000000c1', 'Patrick Homes');
insert into chk0058.client_contacts (id, client_id, name, email, phone) values
  -- Dana: on the client with a name only (Award adds a contact as typed on the lead).
  ('00000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-0000000000c1', 'Dana', '', ''),
  -- Ann: an email, no phone. Ben: both.
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000c1', 'Ann', 'ann@example.com', ''),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000c1', 'Ben', 'ben@example.com', '602-555-0102');

create function chk0058.expect(what text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', what, got, want; end if;
  raise notice 'ok  %', what;
end $$;

do $$
declare j chk0058.jobs;
begin
  -- An existing job with its own details and no contact, as Award finds it.
  insert into chk0058.jobs values ('00000000-0000-4000-8000-0000000000e1', null, 'Patrick Homes', 'own@example.com', '480-555-0001', null);

  -- First contact, a record with no email or phone (Award's update: client and contact together): the job's stand.
  update chk0058.jobs set client_id = '00000000-0000-4000-8000-0000000000c1', contact_id = '00000000-0000-4000-8000-00000000000d'
    where id = '00000000-0000-4000-8000-0000000000e1' returning * into j;
  perform chk0058.expect('none -> empty record: linked', j.contact_id::text, '00000000-0000-4000-8000-00000000000d');
  perform chk0058.expect('none -> empty record: the job''s email stands', j.client_email, 'own@example.com');
  perform chk0058.expect('none -> empty record: the job''s phone stands', j.client_phone, '480-555-0001');

  -- From that contact to another (Ann, email only): replaced, and her empty phone clears the job's.
  update chk0058.jobs set contact_id = '00000000-0000-4000-8000-00000000000a' where id = j.id returning * into j;
  perform chk0058.expect('A -> B: email is the new record''s', j.client_email, 'ann@example.com');
  perform chk0058.expect('A -> B: a phone the new record lacks is cleared', j.client_phone, null);

  -- First contact, a record with both: the record's win over the job's.
  insert into chk0058.jobs values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', '', 'old@example.com', '480-555-0002', null);
  update chk0058.jobs set contact_id = '00000000-0000-4000-8000-00000000000b' where id = '00000000-0000-4000-8000-0000000000e2' returning * into j;
  perform chk0058.expect('none -> full record: email is the record''s', j.client_email, 'ben@example.com');
  perform chk0058.expect('none -> full record: phone is the record''s', j.client_phone, '602-555-0102');

  -- First contact with an email only (Ann): her email, the job's phone kept.
  insert into chk0058.jobs values ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c1', '', 'old@example.com', '480-555-0003', null);
  update chk0058.jobs set contact_id = '00000000-0000-4000-8000-00000000000a' where id = '00000000-0000-4000-8000-0000000000e3' returning * into j;
  perform chk0058.expect('none -> partial record: email is the record''s', j.client_email, 'ann@example.com');
  perform chk0058.expect('none -> partial record: the job''s phone stands', j.client_phone, '480-555-0003');

  -- Unchanged from 0056: a new job takes the record's details, nothing typed survives.
  insert into chk0058.jobs values ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000c1', '', 'typed@example.com', '480-555-0004', '00000000-0000-4000-8000-00000000000d')
    returning * into j;
  perform chk0058.expect('insert: email is the record''s (empty -> null)', j.client_email, null);
  perform chk0058.expect('insert: phone is the record''s (empty -> null)', j.client_phone, null);

  -- Unchanged: Ben -> Ann replaces, Ann -> Ben replaces back.
  update chk0058.jobs set contact_id = '00000000-0000-4000-8000-00000000000b' where id = '00000000-0000-4000-8000-0000000000e2' returning * into j;
  update chk0058.jobs set contact_id = '00000000-0000-4000-8000-00000000000a' where id = j.id returning * into j;
  perform chk0058.expect('B -> A: Ben''s phone is dropped', j.client_phone, null);
end $$;

rollback;
