-- Phase 2 checks for the app functions. Run on a freshly seeded local database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase2_test.sql
-- Everything runs inside a transaction that is rolled back at the end.
-- Each check raises an exception if it fails.

begin;

-- act as the demo user
create or replace function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- a second user, created as a real sign-up would
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999',
  'authenticated', 'authenticated', 'other@example.com', '', now(), '{}', '{}', now(), now());

set local role authenticated;
select pg_temp.login('11111111-1111-1111-1111-111111111111');

do $$
declare
  v_ex   public.exercises;
  v_n    int;
  v_plan uuid;
  v_ver  uuid;
begin
  -- current version of the demo plan is 2
  if public.is_current_version('33333333-3333-3333-3333-333333333333') then
    raise exception 'FAIL: version 1 should not be current';
  end if;
  if not public.is_current_version('44444444-4444-4444-4444-444444444444') then
    raise exception 'FAIL: version 2 should be current';
  end if;

  -- edit on the current version: two fields changed, one unchanged -> 2 changes rows
  select * into v_ex from public.exercises
  where version_id = '44444444-4444-4444-4444-444444444444' and name = 'Panca piana';
  perform public.edit_exercise(v_ex.id, '{"load_kg": 55, "sets": 5, "reps_min": 6}', 'Mi sentivo forte');
  select count(*) into v_n from public.changes
  where exercise_id = v_ex.id and origin = 'user' and reason = 'Mi sentivo forte';
  if v_n <> 2 then raise exception 'FAIL: expected 2 user changes, got %', v_n; end if;

  -- default reason
  perform public.edit_exercise(v_ex.id, '{"notes": "fermo al petto"}');
  if not exists (select 1 from public.changes where exercise_id = v_ex.id and field = 'notes'
                 and reason = 'Modifica manuale') then
    raise exception 'FAIL: default reason missing';
  end if;

  -- not editable field
  begin
    perform public.edit_exercise(v_ex.id, '{"locked": false}');
    raise exception 'FAIL: locked should not be editable through edit_exercise';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- old version is read-only, through the function and directly
  select * into v_ex from public.exercises
  where version_id = '33333333-3333-3333-3333-333333333333' and name = 'Panca piana';
  begin
    perform public.edit_exercise(v_ex.id, '{"load_kg": 70}');
    raise exception 'FAIL: old version edited through function';
  exception when check_violation then null;
  end;
  begin
    update public.exercises set locked = true where id = v_ex.id;
    raise exception 'FAIL: old version edited directly';
  exception when check_violation then null;
  end;

  -- add + move + remove on the current version
  v_ex := public.add_exercise('44444444-4444-4444-4444-444444444444', 1::smallint,
    '{"name": "Curl bilanciere", "sets": 3, "reps_min": 10, "reps_max": 12}');
  if v_ex.position <> 4 then raise exception 'FAIL: new exercise should be position 4, got %', v_ex.position; end if;
  perform public.move_exercise(v_ex.id, 'up');
  if (select position from public.exercises where id = v_ex.id) <> 3 then
    raise exception 'FAIL: move up';
  end if;
  perform public.move_exercise(v_ex.id, 'down');
  perform public.move_exercise(v_ex.id, 'down');  -- already last: no-op
  if (select position from public.exercises where id = v_ex.id) <> 4 then
    raise exception 'FAIL: move down';
  end if;
  perform public.remove_exercise(v_ex.id, 'Non serve');
  if exists (select 1 from public.exercises where id = v_ex.id) then
    raise exception 'FAIL: not removed';
  end if;
  if (select count(*) from public.changes where lineage_id = v_ex.lineage_id) <> 2 then
    raise exception 'FAIL: add and remove should both be logged';
  end if;

  -- adding to an old version is refused
  begin
    perform public.add_exercise('33333333-3333-3333-3333-333333333333', 1::smallint, '{"name": "X"}');
    raise exception 'FAIL: added to old version';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- create_plan gives version 1 + rules
  v_plan := public.create_plan('  Push Pull Legs ');
  select id into v_ver from public.plan_versions where plan_id = v_plan and version_number = 1;
  if v_ver is null then raise exception 'FAIL: version 1 not created'; end if;
  if not exists (select 1 from public.plan_rules where plan_id = v_plan) then
    raise exception 'FAIL: rules not created';
  end if;
  if (select name from public.plans where id = v_plan) <> 'Push Pull Legs' then
    raise exception 'FAIL: name not trimmed';
  end if;

  -- AI cannot be enabled without a key
  begin
    update public.user_settings set ai_enabled = true;
    raise exception 'FAIL: ai enabled without key';
  exception when check_violation then null;
  end;

  -- bad key format
  begin
    perform public.set_api_key('ciao');
    raise exception 'FAIL: bad key accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- valid key: stored, AI can be enabled, setting it again updates the same secret
  perform public.set_api_key('sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  if (select api_key_secret_id from public.user_settings) is null then
    raise exception 'FAIL: key reference not saved';
  end if;
  update public.user_settings set ai_enabled = true;
  perform public.set_api_key('sk-ant-api03-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');

  -- the browser role cannot read the vault
  begin
    perform 1 from vault.decrypted_secrets;
    raise exception 'FAIL: vault readable by authenticated';
  exception when insufficient_privilege then null;
  end;

  -- the browser role cannot write the key reference directly
  begin
    update public.user_settings set api_key_secret_id = gen_random_uuid();
    raise exception 'FAIL: api_key_secret_id writable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- check the vault contents as the owner
reset role;
do $$
begin
  if (select count(*) from vault.decrypted_secrets
      where name = 'claude_api_key_11111111-1111-1111-1111-111111111111'
        and decrypted_secret = 'sk-ant-api03-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB') <> 1 then
    raise exception 'FAIL: secret not updated in place';
  end if;
end $$;

-- the other user sees nothing of the demo user and cannot edit it
set local role authenticated;
select pg_temp.login('99999999-9999-9999-9999-999999999999');
do $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.exercises) then
    raise exception 'FAIL: other user sees exercises';
  end if;
  begin
    perform public.edit_exercise(
      (select id from public.exercises limit 1), '{"load_kg": 1}');
    raise exception 'FAIL: other user edit';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.add_exercise('44444444-4444-4444-4444-444444444444', 1::smallint, '{"name": "X"}');
    raise exception 'FAIL: other user add';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform public.delete_api_key();  -- has no key: no-op
end $$;

-- demo user deletes the key: AI switched off, secret gone
select pg_temp.login('11111111-1111-1111-1111-111111111111');
select public.delete_api_key();
do $$
begin
  if (select ai_enabled or api_key_secret_id is not null from public.user_settings) then
    raise exception 'FAIL: key not cleared';
  end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from vault.secrets where name like 'claude_api_key_1111%') then
    raise exception 'FAIL: secret not deleted';
  end if;
end $$;

-- anon cannot call the functions
set local role anon;
do $$
begin
  perform public.create_plan('x');
  raise exception 'FAIL: anon create_plan';
exception when insufficient_privilege then null;
end $$;

reset role;
select 'phase 2 tests: all passed' as result;
rollback;
