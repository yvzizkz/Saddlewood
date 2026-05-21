-- Document the full set of values allowed in estimates.review_status.
-- The original schema comment listed 6 values but Phase 3's request_changes
-- PATCH writes a 7th value, 'changes_requested'. Any downstream filter or
-- analytics that hard-codes the documented enum would silently miss those
-- rows otherwise. No CHECK constraint is added yet — Marco is the only
-- writer today and the route's zod schema is the de-facto guardrail.

comment on column public.estimates.review_status is
  'Enum of strings: draft, in_review, approved, sent, archived, cancelled, changes_requested. No DB CHECK; API route validates.';
