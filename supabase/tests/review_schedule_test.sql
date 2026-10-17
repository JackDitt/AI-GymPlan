-- Checks for the review frequency, plan_review_state and the "today" settings.
-- Run on a freshly seeded local database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/review_schedule_test.sql
-- Everything runs inside a transaction that is rolled back at the end.
-- Each check raises an exception if it fails.

begin;

create or replace function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- 03:05 today, local time of the given zone
create or replace function pg_temp.at3(p_tz text, p_days integer default 0) returns timestamptz language sql as $$
  select ((date_trunc('day', now() at time zone p_tz) + make_interval(days => p_days) + interval '3 hours 5 minutes')
          at time zone p_tz);
$$;

-- is the demo plan due at p_now? returns the reason or null
create or replace function pg_temp.due(p_now timestamptz) returns text language sql as $$
  select reason from public.plans_due_for_review(p_now)
  where plan_id = '22222222-2222-2222-2222-222222222222';
$$;

-- a second user with a plan of their own
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999',
  'authenticated', 'authenticated', 'other@example.com', '', now(), '{}', '{}', now(), now());
insert into public.plans (id, user_id, name) values
  ('55555555-5555-5555-5555-555555555555', '99999999-9999-9999-9999-999999999999', 'Altra scheda');

-- ---------------------------------------------------------------------------
-- What the signed-in user can and cannot do
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('11111111-1111-1111-1111-111111111111');

do $$
begin
  -- defaults on the seeded plan
  if (select review_every_days from public.plan_rules) <> 7
     or not (select review_on_pain from public.plan_rules) then
    raise exception 'FAIL: wrong review defaults';
  end if;

  -- the user chooses the frequency
  update public.plan_rules set review_every_days = 1;
  begin
    update public.plan_rules set review_every_days = 0;
    raise exception 'FAIL: 0 days accepted';
  exception when check_violation then null;
  end;
  begin
    update public.plan_rules set review_every_days = 29;
    raise exception 'FAIL: 29 days accepted';
  exception when check_violation then null;
  end;

  -- time zone: valid accepted, invalid refused
  update public.user_settings set timezone = 'America/New_York';
  begin
    update public.user_settings set timezone = 'Mars/Olympus';
    raise exception 'FAIL: invalid time zone accepted';
  exception when check_violation then null;
  end;

  -- active plan: own plan yes, someone else's plan no
  update public.user_settings set active_plan_id = '22222222-2222-2222-2222-222222222222';
  begin
    update public.user_settings set active_plan_id = '55555555-5555-5555-5555-555555555555';
    raise exception 'FAIL: active plan of another user accepted';
  exception when foreign_key_violation then null;
  end;

  -- review state: readable, not writable
  if (select last_status from public.plan_review_state) is distinct from 'ok' then
    raise exception 'FAIL: review state not readable';
  end if;
  begin
    update public.plan_review_state set last_status = 'error', last_review_at = now();
    raise exception 'FAIL: review state writable';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.plan_review_state (plan_id, last_review_at, last_status)
      values ('22222222-2222-2222-2222-222222222222', now(), 'ok');
    raise exception 'FAIL: review state insertable';
  exception when insufficient_privilege then null;
  end;

  -- the scheduler function is not callable from the browser
  begin
    perform public.plans_due_for_review();
    raise exception 'FAIL: plans_due_for_review callable by authenticated';
  exception when insufficient_privilege then null;
  end;
end $$;

-- the other user does not see the demo review state
select pg_temp.login('99999999-9999-9999-9999-999999999999');
do $$
begin
  if exists (select 1 from public.plan_review_state) then
    raise exception 'FAIL: other user sees review state';
  end if;
end $$;

-- deleting the active plan clears active_plan_id, it does not delete settings
select pg_temp.login('11111111-1111-1111-1111-111111111111');
savepoint before_delete;
delete from public.plans where id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  if (select active_plan_id from public.user_settings) is not null then
    raise exception 'FAIL: active_plan_id not cleared';
  end if;
end $$;
rollback to savepoint before_delete;

-- ---------------------------------------------------------------------------
-- When a plan is due (as the scheduler: owner role)
-- ---------------------------------------------------------------------------
reset role;

update public.user_settings
  set timezone = 'Europe/Rome', api_key_secret_id = gen_random_uuid(), ai_enabled = true
  where user_id = '11111111-1111-1111-1111-111111111111';
update public.plan_rules set review_every_days = 7, review_on_pain = true;
delete from public.workout_logs where pain;  -- start with no pain at all

do $$
declare
  t timestamptz := pg_temp.at3('Europe/Rome');
begin
  -- weekly plan, last review 7 days ago -> due tonight
  update public.plan_review_state set last_review_at = t - interval '7 days', last_status = 'ok';
  if pg_temp.due(t) is distinct from 'interval' then raise exception 'FAIL: weekly due, got %', pg_temp.due(t); end if;

  -- only at 03:xx local time
  if pg_temp.due(t + interval '1 hour') is not null then raise exception 'FAIL: due at 04:05'; end if;
  if pg_temp.due(t - interval '1 hour') is not null then raise exception 'FAIL: due at 02:05'; end if;

  -- 6 days ago -> not yet
  update public.plan_review_state set last_review_at = t - interval '6 days';
  if pg_temp.due(t) is not null then raise exception 'FAIL: weekly plan due after 6 days'; end if;

  -- daily plan, reviewed last night -> due again tonight
  update public.plan_rules set review_every_days = 1;
  update public.plan_review_state set last_review_at = t - interval '1 day';
  if pg_temp.due(t) is distinct from 'interval' then raise exception 'FAIL: daily plan not due'; end if;

  -- ...but never twice in the same local day
  update public.plan_review_state set last_review_at = t - interval '3 minutes';
  if pg_temp.due(t) is not null then raise exception 'FAIL: reviewed twice in one day'; end if;

  -- every 3 days
  update public.plan_rules set review_every_days = 3;
  update public.plan_review_state set last_review_at = t - interval '2 days';
  if pg_temp.due(t) is not null then raise exception 'FAIL: 3-day plan due after 2 days'; end if;
  update public.plan_review_state set last_review_at = t - interval '3 days';
  if pg_temp.due(t) is distinct from 'interval' then raise exception 'FAIL: 3-day plan not due after 3 days'; end if;

  -- pain logged yesterday evening -> due tonight even if the interval has not passed
  update public.plan_rules set review_every_days = 14;
  update public.plan_review_state set last_review_at = t - interval '2 days';
  if pg_temp.due(t) is not null then raise exception 'FAIL: due without pain'; end if;
  insert into public.workout_logs (user_id, exercise_id, performed_on, pain, comment, created_at)
  select e.user_id, e.id, (t - interval '8 hours')::date, true, 'Male al ginocchio', t - interval '8 hours'
  from public.exercises e
  where e.version_id = '44444444-4444-4444-4444-444444444444' and e.name = 'Squat';
  if pg_temp.due(t) is distinct from 'pain' then raise exception 'FAIL: pain did not trigger a review'; end if;

  -- ...unless the user switched that off
  update public.plan_rules set review_on_pain = false;
  if pg_temp.due(t) is not null then raise exception 'FAIL: pain triggered with review_on_pain off'; end if;
  update public.plan_rules set review_on_pain = true;

  -- pain already seen by the last review does not trigger again
  update public.plan_review_state set last_review_at = t - interval '6 hours';
  if pg_temp.due(t + interval '1 day') is not null then raise exception 'FAIL: old pain triggered again'; end if;

  -- failed review -> retried the next night
  update public.plan_review_state set last_review_at = t - interval '1 day', last_status = 'error';
  if pg_temp.due(t) is distinct from 'retry' then raise exception 'FAIL: error not retried'; end if;

  -- never reviewed: the interval counts from the plan creation (14 days ago in the seed)
  delete from public.plan_review_state;
  if pg_temp.due(t) is distinct from 'interval' then raise exception 'FAIL: never-reviewed plan not due'; end if;
  update public.plan_rules set review_every_days = 28;
  if pg_temp.due(t) is distinct from 'pain' then raise exception 'FAIL: never-reviewed plan with pain'; end if;
  delete from public.workout_logs where pain;
  if pg_temp.due(t) is not null then raise exception 'FAIL: new plan due before 28 days'; end if;

  -- AI switched off -> never due
  update public.plan_rules set review_every_days = 1;
  update public.user_settings set ai_enabled = false where user_id = '11111111-1111-1111-1111-111111111111';
  if pg_temp.due(t) is not null then raise exception 'FAIL: due with AI off'; end if;
  update public.user_settings set ai_enabled = true where user_id = '11111111-1111-1111-1111-111111111111';

  -- the user's own night: 03:05 in New York is 09:05 in Rome
  update public.user_settings set timezone = 'America/New_York' where user_id = '11111111-1111-1111-1111-111111111111';
  if pg_temp.due(t) is not null then raise exception 'FAIL: New York user due at Rome night'; end if;
  if pg_temp.due(pg_temp.at3('America/New_York')) is null then raise exception 'FAIL: New York user not due at New York night'; end if;
end $$;

select 'review schedule tests: all passed' as result;
rollback;
