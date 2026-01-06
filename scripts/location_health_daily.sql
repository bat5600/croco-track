-- Location health daily scoring (v1)
-- score_day uses Europe/Paris date.

create table if not exists public.location_health_daily (
  location_id text not null,
  score_day date not null,
  login_score int not null,
  features_score int not null,
  trend_score int not null,
  health_score int not null,
  login_days_30d int not null,
  active_days_available_30d int not null,
  feature_units_curr numeric not null,
  feature_units_prev numeric not null,
  delta_units numeric not null,
  score_version text not null default 'v1',
  computed_at timestamptz not null default now(),
  primary key (location_id, score_day, score_version)
);

create index if not exists location_health_daily_score_day_idx
  on public.location_health_daily (score_day);

create index if not exists location_health_daily_score_day_health_idx
  on public.location_health_daily (score_day, health_score);

create index if not exists location_health_daily_location_idx
  on public.location_health_daily (location_id);

create or replace view public.location_health_latest as
select distinct on (location_id)
  location_id,
  score_day,
  login_score,
  features_score,
  trend_score,
  health_score,
  score_version,
  computed_at
from public.location_health_daily
order by location_id, score_day desc, computed_at desc;

create or replace function public.compute_location_health_daily(
  p_score_day date default (timezone('Europe/Paris', now())::date)
)
returns void
language plpgsql
as $$
declare
  v_score_day date := p_score_day;
begin
  with
  params as (
    select v_score_day as score_day
  ),
  feature_keys as (
    select array[
      'dashboard',
      'marketing',
      'contacts',
      'funnels-websites',
      'settings',
      'automation',
      'emails',
      'workflow',
      'page-builder',
      'memberships',
      'conversations',
      'payments',
      'calendars',
      'opportunities',
      'form-builder',
      'blogs',
      'reputation'
    ]::text[] as keys
  ),
  feature_params as (
    select
      keys,
      array_length(keys, 1) as key_count,
      ceil(array_length(keys, 1)::numeric * 0.5) as adopted_target
    from feature_keys
  ),
  locations as (
    select distinct location_id
    from public.user_last_seen
    union
    select distinct location_id
    from public.feature_daily fd, params p
    where fd.day between (p.score_day - 59) and p.score_day
  ),
  first_seen as (
    select
      location_id,
      min((last_seen_at at time zone 'Europe/Paris')::date) as first_seen_day
    from public.user_last_seen
    group by location_id
  ),
  login_30d as (
    select
      uls.location_id,
      count(distinct (uls.last_seen_at at time zone 'Europe/Paris')::date) as login_days_30d
    from public.user_last_seen uls, params p
    where (uls.last_seen_at at time zone 'Europe/Paris')::date
      between (p.score_day - 29) and p.score_day
    group by uls.location_id
  ),
  feature_curr as (
    select
      fd.location_id,
      fd.feature_key,
      sum(fd.time_sec)::numeric as sec
    from public.feature_daily fd, params p, feature_params fp
    where fd.day between (p.score_day - 29) and p.score_day
      and fd.feature_key = any(fp.keys)
    group by fd.location_id, fd.feature_key
  ),
  curr_units as (
    select
      location_id,
      sum(least(1, sec / 3600.0)) as feature_units_curr
    from feature_curr
    group by location_id
  ),
  feature_prev as (
    select
      fd.location_id,
      fd.feature_key,
      sum(fd.time_sec)::numeric as sec
    from public.feature_daily fd, params p, feature_params fp
    where fd.day between (p.score_day - 59) and (p.score_day - 30)
      and fd.feature_key = any(fp.keys)
    group by fd.location_id, fd.feature_key
  ),
  prev_units as (
    select
      location_id,
      sum(least(1, sec / 3600.0)) as feature_units_prev
    from feature_prev
    group by location_id
  )
  insert into public.location_health_daily (
    location_id,
    score_day,
    login_score,
    features_score,
    trend_score,
    health_score,
    login_days_30d,
    active_days_available_30d,
    feature_units_curr,
    feature_units_prev,
    delta_units,
    score_version,
    computed_at
  )
  select
    l.location_id,
    p.score_day,
    login_score,
    features_score,
    trend_score,
    (login_score + features_score + trend_score) as health_score,
    coalesce(l30.login_days_30d, 0) as login_days_30d,
    act.active_days_available_30d,
    coalesce(cu.feature_units_curr, 0) as feature_units_curr,
    coalesce(pu.feature_units_prev, 0) as feature_units_prev,
    (coalesce(cu.feature_units_curr, 0) - coalesce(pu.feature_units_prev, 0)) as delta_units,
    'v1' as score_version,
    now() as computed_at
  from locations l
  cross join params p
  cross join feature_params fp
  left join first_seen fs on fs.location_id = l.location_id
  left join login_30d l30 on l30.location_id = l.location_id
  left join curr_units cu on cu.location_id = l.location_id
  left join prev_units pu on pu.location_id = l.location_id
  cross join lateral (
    select
      case
        when fs.first_seen_day is null then 30
        else least(30, greatest(1, (p.score_day - fs.first_seen_day + 1)))
      end as active_days_available_30d
  ) act
  cross join lateral (
    select
      round(
        50 * least(
          1,
          greatest(
            0,
            (coalesce(l30.login_days_30d, 0)::numeric / act.active_days_available_30d)
            / (20.0 / 30.0)
          )
        )
      )::int as login_score,
      round(
        30 * least(
          1,
          greatest(0, coalesce(cu.feature_units_curr, 0) / nullif(fp.adopted_target, 0))
        )
      )::int as features_score,
      case
        when pu.feature_units_prev is null then 10
        else case
          when (coalesce(cu.feature_units_curr, 0) - pu.feature_units_prev) >= 2.0 then 20
          when (coalesce(cu.feature_units_curr, 0) - pu.feature_units_prev) >= 0.5 then 15
          when (coalesce(cu.feature_units_curr, 0) - pu.feature_units_prev) > -0.5 then 10
          when (coalesce(cu.feature_units_curr, 0) - pu.feature_units_prev) > -2.0 then 5
          else 0
        end
      end as trend_score
  ) scores
  on conflict (location_id, score_day, score_version)
  do update set
    login_score = excluded.login_score,
    features_score = excluded.features_score,
    trend_score = excluded.trend_score,
    health_score = excluded.health_score,
    login_days_30d = excluded.login_days_30d,
    active_days_available_30d = excluded.active_days_available_30d,
    feature_units_curr = excluded.feature_units_curr,
    feature_units_prev = excluded.feature_units_prev,
    delta_units = excluded.delta_units,
    computed_at = excluded.computed_at;
end;
$$;

-- Suggested cron call (Supabase Scheduled Function):
-- select public.compute_location_health_daily();
