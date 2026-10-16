-- The escalation_guard trigger stamped accepted_at and resolved_at but never contacted_at or
-- closed_at, and counsellors are (correctly) not allowed to write those columns themselves. Result:
-- contacted_at was always NULL, and any API call that tried to set it failed with "permission denied".
-- Stamp both in the trigger so the application never has to send timestamps.
create or replace function app.escalation_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if new.status is distinct from old.status then
    if not (
         (old.status = 'new'      and new.status = 'assigned')
      or (old.status = 'assigned' and new.status in ('contacted', 'resolved', 'closed_no_response'))
      or (old.status = 'contacted' and new.status in ('resolved', 'closed_no_response'))
      or public.is_staff('admin')
    ) then
      raise exception 'illegal status transition % -> %', old.status, new.status using errcode = '23514';
    end if;
    if new.status = 'assigned' then
      if not public.is_staff('admin') then new.counsellor_id := (select auth.uid()); end if;
      new.accepted_at := now();
    end if;
    if new.status = 'contacted' then new.contacted_at := coalesce(old.contacted_at, now()); end if;
    if new.status in ('resolved', 'closed_no_response') then new.resolved_at := now(); end if;
    if new.status = 'closed_no_response' then new.closed_at := now(); end if;
  end if;
  return new;
end $$;
