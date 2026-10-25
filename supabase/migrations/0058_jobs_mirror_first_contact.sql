-- A job given its first contact keeps what it has (Ship's review of #60).
--
-- 0056's jobs_client_mirror took the "another person" branch whenever
-- contact_id changed, including from none to a contact: Award linking an
-- existing job that had no contact (src/lib/sales/awardStore.ts) then wiped
-- the job's own email or phone wherever that contact record had none.
--
-- Now a job that had no contact is treated like the same person: the record's
-- non-empty values win, an empty one keeps the job's. "The record's details,
-- never the last person's left behind" holds only when the job moves from one
-- contact to a different one, and for a new job. The function is replaced in
-- place; the trigger already calls it. 0056 is unchanged.

begin;

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
    elsif tg_op = 'UPDATE' and (old.contact_id is null or new.contact_id = old.contact_id) then
      -- Same person, or the job's first: only what the record has; an empty one keeps the job's.
      new.client_email := coalesce(nullif(c.email, ''), new.client_email);
      new.client_phone := coalesce(nullif(c.phone, ''), new.client_phone);
    else
      -- A new job or another person: the record's details, never the last
      -- person's left behind.
      new.client_email := nullif(c.email, '');
      new.client_phone := nullif(c.phone, '');
    end if;
  end if;
  return new;
end $$;

revoke all on function public.jobs_client_mirror() from public, anon, authenticated, service_role;

commit;
