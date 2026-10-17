-- AI-GymPlan: review frequency chosen per plan, and the "today" workout
--
-- * Each plan decides how often the AI reviews it: every N days (1 = every
--   night, 7 = once a week, up to 28), and optionally also the night after
--   pain is logged. Example: a daily full-body plan, sore knees on Monday
--   evening, legs already lighter on Tuesday morning.
-- * Reviews run at night in the user's own time zone (user_settings.timezone),
--   so the plan is up to date when the user opens the app the next day.
-- * exercises.day is now the day of the week: 1 = Monday ... 7 = Sunday.
--   The app opens on today's workout.
-- * user_settings.active_plan_id is the plan the app opens on.
-- * Review bookkeeping moves from user_settings (one per user) to
--   plan_review_state (one per plan). Only the backend writes it.

comment on column public.exercises.day is 'Day of the week: 1 = Monday ... 7 = Sunday';

-- ---------------------------------------------------------------------------
-- plan_rules: how often the AI reviews this plan
-- ---------------------------------------------------------------------------
alter table public.plan_rules
  add column review_every_days smallint not null default 7
    check (review_every_days between 1 and 28),
  add column review_on_pain boolean not null default true;

comment on column public.plan_rules.review_every_days is
  'Days between two AI reviews: 1 = every night, 7 = weekly';
comment on column public.plan_rules.review_on_pain is
  'Also review the night after an exercise is logged with pain';

-- ---------------------------------------------------------------------------
-- user_settings: time zone, plan shown on opening; per-user review columns
-- are replaced by plan_review_state (no review has run yet, they are empty)
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  add column active_plan_id uuid,
  add foreign key (active_plan_id, user_id)
    references public.plans (id, user_id) on delete set null (active_plan_id),
  drop column last_review_at,
  drop column last_review_status,
  drop column last_review_error;

grant update (timezone, active_plan_id) on public.user_settings to authenticated;

create function public.check_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Fuso orario non valido: %', new.timezone
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger user_settings_check_timezone
  before insert or update of timezone on public.user_settings
  for each row execute function public.check_timezone();

revoke execute on function public.check_timezone() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- plan_review_state: outcome of the last review of each plan.
-- Written by the review Edge Function (service role); users can only read it.
-- ---------------------------------------------------------------------------
create table public.plan_review_state (
  plan_id         uuid primary key,
  user_id         uuid not null default auth.uid(),
  last_review_at  timestamptz,           -- last attempt, whatever the outcome
  last_status     text check (last_status in ('ok', 'skipped', 'error')),
  last_error      text check (char_length(last_error) <= 1000),
  check ((last_review_at is null) = (last_status is null)),
  foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade
);

create index on public.plan_review_state (user_id);

alter table public.plan_review_state enable row level security;

create policy "read own review state" on public.plan_review_state
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.plan_review_state from anon, authenticated;
grant select on public.plan_review_state to authenticated;

-- ---------------------------------------------------------------------------
-- plans_due_for_review: called every hour by the scheduler (pg_cron, Phase 4).
-- Returns the plans whose owner is at p_hour local time (03:00 by default)
-- and that need a review tonight:
--   * 'interval': review_every_days have passed since the last review
--     (or since the plan was created, if it was never reviewed);
--   * 'pain':     pain was logged on this plan since the last review;
--   * 'retry':    the last review failed.
-- A plan is never returned twice in the same local day.
-- If there is no new feedback, the Edge Function still skips the review
-- (status 'skipped'), so frequent reviews cost nothing on quiet days.
-- ---------------------------------------------------------------------------
create function public.plans_due_for_review(p_now timestamptz default now(), p_hour integer default 3)
returns table (plan_id uuid, user_id uuid, reason text)
language sql
stable
set search_path = ''
as $$
  with c as (
    select
      p.id                                       as plan_id,
      p.user_id,
      coalesce(r.review_every_days, 7)           as every_days,
      coalesce(r.review_on_pain, true)           as on_pain,
      st.last_review_at,
      st.last_status,
      coalesce(st.last_review_at, p.created_at)  as since,
      (p_now at time zone us.timezone)           as local_now,
      us.timezone
    from public.plans p
    join public.user_settings us on us.user_id = p.user_id
    left join public.plan_rules r on r.plan_id = p.id
    left join public.plan_review_state st on st.plan_id = p.id
    where us.ai_enabled
      and us.api_key_secret_id is not null
  ),
  d as (
    select c.*,
      c.local_now::date - (c.since at time zone c.timezone)::date >= c.every_days as interval_passed,
      c.on_pain and exists (
        select 1
        from public.workout_logs l
        join public.exercises e on e.id = l.exercise_id
        join public.plan_versions v on v.id = e.version_id
        where v.plan_id = c.plan_id
          and l.pain
          and l.created_at > c.since
      ) as new_pain
    from c
    where extract(hour from c.local_now) = p_hour
      and (c.last_review_at is null
           or (c.last_review_at at time zone c.timezone)::date < c.local_now::date)
  )
  select d.plan_id, d.user_id,
    case
      when d.last_status = 'error' then 'retry'
      when d.interval_passed then 'interval'
      else 'pain'
    end
  from d
  where d.last_status = 'error' or d.interval_passed or d.new_pain;
$$;

revoke execute on function public.plans_due_for_review(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.plans_due_for_review(timestamptz, integer) to service_role;
