-- Allow earnings RANGES (min/max) next to the single average values.
begin;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.outcome_metrics'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%metric_key = ANY%'
      and pg_get_constraintdef(oid) not like '%metric_value%'
  loop
    execute format('alter table public.outcome_metrics drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.outcome_metrics add constraint outcome_metrics_metric_key_check check (metric_key in (
  'placement_rate', 'starting_earnings', 'starting_earnings_min', 'starting_earnings_max',
  'earnings_after_period', 'earnings_after_period_min', 'earnings_after_period_max',
  'self_employment_rate', 'job_roles', 'progression', 'nsqf_level'));

commit;
