-- The agreement lives on the job (T112, docs/CONTRACTS-MOVE.md): a document
-- of kind 'agreement', drafted from the awarded job and its accepted
-- proposal, its words contract.py's (src/lib/agreements/text.ts). It is
-- issued and signed like a proposal, at /d/<token>.
--
-- Additive: only widens the kind check. Nothing that reads money counts an
-- agreement (every money reader names its kinds). 0056 is held for the one
-- client record (T119).

begin;

alter table public.documents drop constraint if exists documents_kind_check;
alter table public.documents
  add constraint documents_kind_check check (kind in ('estimate', 'change_order', 'invoice', 'statement', 'notice', 'agreement'));

commit;
