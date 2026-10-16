-- Close two access leaks that the "SIH demo contract" migration (20261003000100) re-opened and the
-- security-hardening migration (20261004000100) did not close. Found by running the RLS suite
-- against the full migration chain.
--
-- 1. Admins could read every family's raw chat transcript (messages_admin_read). Admins need only
--    aggregates, which come from the SECURITY DEFINER admin_* functions, so no application code
--    depends on this policy. Raw transcripts stay visible only to the owning family and to the
--    counsellor who is triaging or has accepted that ticket.
drop policy if exists messages_admin_read on public.messages;

-- 2. escalations_counsellor_queue_read let any counsellor read every 'new' ticket in every district,
--    which overrides the district scoping in escalations_counsellor_read (permissive policies are
--    OR-ed). Admin access is already covered by escalations_admin_read, and counsellor access by
--    escalations_counsellor_read (own tickets, or new tickets in districts they may claim).
drop policy if exists escalations_counsellor_queue_read on public.escalations;
