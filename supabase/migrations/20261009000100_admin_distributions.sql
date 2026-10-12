-- Aggregate breakdowns for the admin dashboard (trade, language, unresolved concerns).
-- Same rules as admin_kpis: staff-only, SECURITY DEFINER with a pinned search_path,
-- and any group smaller than 5 sessions is omitted so no family can be singled out.
begin;

create or replace function public.admin_distributions(
  p_state text default null, p_district text default null, p_trade_id bigint default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare r jsonb;
begin
  if not public.is_staff('admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  with s as (
    select id, lang, selected_trade_id,
           case when jsonb_typeof(concern_state -> 'initial_concerns') = 'array' then concern_state -> 'initial_concerns' else '[]'::jsonb end as initial_c,
           case when jsonb_typeof(concern_state -> 'unresolved_concerns') = 'array' then concern_state -> 'unresolved_concerns' else '[]'::jsonb end as unresolved_c
    from public.sessions
    where (p_state is null or lower(state) = lower(p_state))
      and (p_district is null or lower(district) = lower(p_district))
      and (p_trade_id is null or selected_trade_id = p_trade_id)
  ),
  lang_d as (select s.lang as k, count(*) as n from s group by s.lang having count(*) >= 5),
  trade_d as (
    select t.name_en as k, count(*) as n
    from s join public.trades t on t.id = s.selected_trade_id
    group by t.name_en having count(*) >= 5),
  unresolved_d as (
    select c.value as k, count(*) as n
    from s cross join lateral jsonb_array_elements_text(s.unresolved_c) as c(value)
    group by c.value having count(*) >= 5)
  select jsonb_build_object(
    'language_distribution',          coalesce((select jsonb_object_agg(k, n) from lang_d), '{}'::jsonb),
    'trade_distribution',             coalesce((select jsonb_object_agg(k, n) from trade_d), '{}'::jsonb),
    'unresolved_concerns_by_category', coalesce((select jsonb_object_agg(k, n) from unresolved_d), '{}'::jsonb),
    'sessions_with_concerns',         (select count(*) from s where jsonb_array_length(initial_c) > 0),
    'sessions_with_unresolved',       (select count(*) from s where jsonb_array_length(unresolved_c) > 0))
  into r;
  return r;
end $$;

revoke execute on function public.admin_distributions(text, text, bigint) from public, anon;
grant execute on function public.admin_distributions(text, text, bigint) to authenticated;

commit;
