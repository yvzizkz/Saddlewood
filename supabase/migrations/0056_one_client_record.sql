-- One client record (T119): clients and client_contacts are the source for a
-- job's client details and for an opportunity's contact once it has a client.
--
--   jobs.contact_id                 the person at the client this job deals with
--   sales_opportunities.contact_id  the same, for a lead that has a client
--
-- jobs.client_name / client_email / client_phone and the opportunity's contact
-- JSON stay, as mirrors the database keeps: a job with a client takes the
-- client's name, a job or opportunity with a contact takes that contact's
-- name, email and phone, and renaming a client or editing a contact moves
-- every job and opportunity that points at it. A write to a mirror is
-- overwritten by the record.
--
-- Nothing here adds or edits a contact: client_contacts is the send list for
-- documents and stays the owners' (and Award's) to write. A job or lead whose
-- person isn't on the client yet stays unlinked and keeps its own details.
--
-- A job written without a client (the estimate pipeline's ingest_estimate
-- gives only a name) is linked to the client of that name if one exists; no
-- client is made for a bid.
--
-- public.link_client_records() links what is there and is safe to run again.

begin;

alter table public.jobs
  add column if not exists contact_id uuid references public.client_contacts (id) on delete set null;
alter table public.sales_opportunities
  add column if not exists contact_id uuid references public.client_contacts (id) on delete set null;
create index if not exists jobs_contact_idx on public.jobs (contact_id) where contact_id is not null;
create index if not exists sales_opportunities_contact_idx on public.sales_opportunities (contact_id) where contact_id is not null;

-- The job's mirror of its client and contact.
create or replace function public.jobs_client_mirror() returns trigger
language plpgsql as $$
declare
  c record;
begin
  if new.client_id is null and nullif(btrim(new.client_name), '') is not null then
    select id into new.client_id from public.clients where lower(name) = lower(btrim(new.client_name));
  end if;
  if new.client_id is not null then
    select name into new.client_name from public.clients where id = new.client_id;
  end if;
  if new.contact_id is not null then
    select * into c from public.client_contacts where id = new.contact_id;
    if c.client_id is distinct from new.client_id then
      -- A contact belongs to one client; a job moved to another client drops it.
      new.contact_id := null;
    else
      new.client_email := nullif(c.email, '');
      new.client_phone := nullif(c.phone, '');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists jobs_client_mirror on public.jobs;
create trigger jobs_client_mirror before insert or update on public.jobs
  for each row execute function public.jobs_client_mirror();

-- The opportunity's mirror of its contact (company stays as typed).
create or replace function public.opportunities_contact_mirror() returns trigger
language plpgsql as $$
declare
  c record;
begin
  if new.contact_id is not null then
    select * into c from public.client_contacts where id = new.contact_id;
    if new.client_id is null then
      new.client_id := c.client_id;
    end if;
    if c.client_id is distinct from new.client_id then
      new.contact_id := null;
    else
      new.contact := (coalesce(new.contact, '{}'::jsonb) - 'email' - 'phone')
        || jsonb_build_object('name', c.name)
        || case when c.email <> '' then jsonb_build_object('email', c.email) else '{}'::jsonb end
        || case when c.phone <> '' then jsonb_build_object('phone', c.phone) else '{}'::jsonb end;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists opportunities_contact_mirror on public.sales_opportunities;
create trigger opportunities_contact_mirror before insert or update on public.sales_opportunities
  for each row execute function public.opportunities_contact_mirror();

-- A renamed client or an edited contact moves its mirrors.
create or replace function public.client_records_propagate() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'clients' then
    if new.name is distinct from old.name then
      update public.jobs set client_name = new.name where client_id = new.id;
    end if;
  elsif (new.name, new.email, new.phone) is distinct from (old.name, old.email, old.phone) then
    update public.jobs set contact_id = contact_id where contact_id = new.id;
    update public.sales_opportunities set contact_id = contact_id where contact_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists clients_propagate on public.clients;
create trigger clients_propagate after update on public.clients
  for each row execute function public.client_records_propagate();
drop trigger if exists client_contacts_propagate on public.client_contacts;
create trigger client_contacts_propagate after update on public.client_contacts
  for each row execute function public.client_records_propagate();

-- The contact already on a client matching an email (case-insensitive), else
-- a name when there is no email (Award's rule). Only finds; never makes one.
create or replace function public.client_contact_match(p_client uuid, p_name text, p_email text) returns uuid
language sql stable as $$
  select id from public.client_contacts
   where client_id = p_client and active
     and case when btrim(coalesce(p_email, '')) <> '' then lower(email) = lower(btrim(p_email))
              else btrim(coalesce(p_name, '')) <> '' and lower(name) = lower(btrim(p_name)) end
   order by created_at limit 1
$$;

create or replace function public.link_client_records() returns jsonb
language plpgsql as $$
declare
  n_jobs_client integer;
  n_opps_client integer;
  n_opps_contact integer;
  n_jobs_contact integer;
  n_jobs_from_opp integer;
begin
  -- 1. A job named for a client that exists points at it (the trigger links by name).
  update public.jobs set client_name = client_name
   where client_id is null and nullif(btrim(client_name), '') is not null
     and exists (select 1 from public.clients c where lower(c.name) = lower(btrim(jobs.client_name)));
  get diagnostics n_jobs_client = row_count;

  -- 2. An opportunity whose job has a client has that client.
  update public.sales_opportunities o set client_id = j.client_id
    from public.jobs j
   where o.job_id = j.id and o.client_id is null and j.client_id is not null;
  get diagnostics n_opps_client = row_count;

  -- 3. An opportunity with a client points at its contact, when the client has it.
  update public.sales_opportunities
     set contact_id = public.client_contact_match(client_id, contact ->> 'name', contact ->> 'email')
   where client_id is not null and contact_id is null
     and public.client_contact_match(client_id, contact ->> 'name', contact ->> 'email') is not null;
  get diagnostics n_opps_contact = row_count;

  -- 4. A job takes its opportunity's contact, else the client's contact its email names.
  update public.jobs j set contact_id = o.contact_id
    from public.sales_opportunities o
   where o.job_id = j.id and j.contact_id is null and o.contact_id is not null and o.client_id = j.client_id;
  get diagnostics n_jobs_from_opp = row_count;
  update public.jobs
     set contact_id = public.client_contact_match(client_id, '', client_email)
   where client_id is not null and contact_id is null and nullif(btrim(client_email), '') is not null
     and public.client_contact_match(client_id, '', client_email) is not null;
  get diagnostics n_jobs_contact = row_count;

  return jsonb_build_object('jobs_linked_to_client', n_jobs_client, 'opportunities_linked_to_client', n_opps_client,
                            'opportunities_given_contact', n_opps_contact, 'jobs_given_contact', n_jobs_from_opp + n_jobs_contact);
end $$;

revoke all on function public.link_client_records() from public, anon, authenticated, service_role;
revoke all on function public.client_contact_match(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.jobs_client_mirror() from public, anon, authenticated, service_role;
revoke all on function public.opportunities_contact_mirror() from public, anon, authenticated, service_role;
revoke all on function public.client_records_propagate() from public, anon, authenticated, service_role;

select public.link_client_records();

comment on column public.jobs.contact_id is 'The client contact this job deals with; client_name/client_email/client_phone mirror clients and this contact (0056).';
comment on column public.sales_opportunities.contact_id is 'The client contact, once the lead has a client; the contact JSON then mirrors it (0056).';

commit;
