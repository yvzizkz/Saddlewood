-- The client's link takes two more sections: Timeline and Payments (src/lib/portal).

alter table public.client_portals drop constraint if exists client_portals_sections_check;
alter table public.client_portals add constraint client_portals_sections_check
  check (sections <@ array['timeline', 'payments', 'documents', 'log', 'complaint']::text[]);
