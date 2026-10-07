-- AI-GymPlan: Phase 2 - functions used by the web app
--
-- * Manual edits go through small SQL functions so that every change made by
--   the user is written to public.changes (origin 'user') in the same
--   transaction. The weekly AI review reads these rows and will not undo them.
-- * Only the latest version of a plan can be edited. Older versions are history.
-- * The Claude API key is stored encrypted in Supabase Vault. The browser can
--   set or delete it, but can never read it back.
--
-- The plain functions are SECURITY INVOKER: they run as the signed-in user,
-- so Row Level Security still applies to every row they touch.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- true if the version is the most recent one of its plan
create function public.is_current_version(p_version_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select v.version_number = (
    select max(v2.version_number) from public.plan_versions v2 where v2.plan_id = v.plan_id
  )
  from public.plan_versions v
  where v.id = p_version_id;
$$;

-- Old versions are read-only (only the current one can change).
create function public.protect_old_versions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not coalesce(public.is_current_version(old.version_id), false) then
    raise exception 'Le versioni precedenti non si possono modificare'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger exercises_protect_old_versions
  before update on public.exercises
  for each row execute function public.protect_old_versions();

-- keep plan_rules.updated_at fresh
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger plan_rules_touch_updated_at
  before update on public.plan_rules
  for each row execute function public.touch_updated_at();

-- Fields of an exercise the user (and later the AI) may change.
-- day, position and locked are handled separately.
create function public.editable_exercise_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['name', 'sets', 'reps_min', 'reps_max', 'load_kg', 'rest_seconds', 'notes'];
$$;

-- ---------------------------------------------------------------------------
-- create_plan: a new plan with an empty version 1 and its rules row
-- ---------------------------------------------------------------------------
create function public.create_plan(p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  insert into public.plans (name) values (trim(p_name)) returning id into v_plan_id;
  insert into public.plan_versions (plan_id, version_number, created_by, summary)
    values (v_plan_id, 1, 'user', 'Scheda iniziale');
  insert into public.plan_rules (plan_id) values (v_plan_id);
  return v_plan_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- edit_exercise: change one or more fields of an exercise.
-- p_patch is a JSON object, e.g. {"load_kg": 52.5, "notes": "fermo in basso"}.
-- One changes row is written for every field that actually changed.
-- Locked rows can still be edited by the user: the lock only stops the AI.
-- ---------------------------------------------------------------------------
create function public.edit_exercise(p_exercise_id uuid, p_patch jsonb, p_reason text default null)
returns public.exercises
language plpgsql
set search_path = ''
as $$
declare
  v_old    public.exercises;
  v_new    public.exercises;
  v_key    text;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Modifica manuale');
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'p_patch deve essere un oggetto JSON';
  end if;

  select * into v_old from public.exercises where id = p_exercise_id for update;
  if not found then
    raise exception 'Esercizio non trovato';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not v_key = any (public.editable_exercise_fields()) then
      raise exception 'Campo non modificabile: %', v_key;
    end if;
  end loop;

  v_new := jsonb_populate_record(v_old, p_patch);

  update public.exercises set
    name         = v_new.name,
    sets         = v_new.sets,
    reps_min     = v_new.reps_min,
    reps_max     = v_new.reps_max,
    load_kg      = v_new.load_kg,
    rest_seconds = v_new.rest_seconds,
    notes        = nullif(trim(v_new.notes), '')
  where id = p_exercise_id
  returning * into v_new;

  for v_key in select jsonb_object_keys(p_patch) loop
    if (to_jsonb(v_old) -> v_key) is distinct from (to_jsonb(v_new) -> v_key) then
      insert into public.changes
        (version_id, exercise_id, lineage_id, action, field, old_value, new_value, reason, origin)
      values
        (v_old.version_id, v_old.id, v_old.lineage_id, 'update', v_key,
         to_jsonb(v_old) -> v_key, to_jsonb(v_new) -> v_key, v_reason, 'user');
    end if;
  end loop;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_exercise: append an exercise at the end of a day of the current version.
-- p_data uses the same keys as edit_exercise; "name" is required.
-- ---------------------------------------------------------------------------
create function public.add_exercise(p_version_id uuid, p_day smallint, p_data jsonb, p_reason text default null)
returns public.exercises
language plpgsql
set search_path = ''
as $$
declare
  v_row    public.exercises;
  v_key    text;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Aggiunto a mano');
begin
  if not coalesce(public.is_current_version(p_version_id), false) then
    raise exception 'Si può modificare solo la versione corrente';
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_data, '{}')) loop
    if not v_key = any (public.editable_exercise_fields()) then
      raise exception 'Campo non valido: %', v_key;
    end if;
  end loop;

  v_row := jsonb_populate_record(null::public.exercises, p_data);

  insert into public.exercises
    (version_id, day, position, name, sets, reps_min, reps_max, load_kg, rest_seconds, notes)
  values (
    p_version_id,
    p_day,
    coalesce((select max(e.position) from public.exercises e
              where e.version_id = p_version_id and e.day = p_day), 0) + 1,
    trim(v_row.name), v_row.sets, v_row.reps_min, v_row.reps_max,
    v_row.load_kg, v_row.rest_seconds, nullif(trim(v_row.notes), '')
  )
  returning * into v_row;

  insert into public.changes
    (version_id, exercise_id, lineage_id, action, new_value, reason, origin)
  values
    (p_version_id, v_row.id, v_row.lineage_id, 'add',
     to_jsonb(v_row) - array['id', 'user_id', 'version_id', 'lineage_id', 'created_at'],
     v_reason, 'user');

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_exercise: delete an exercise from the current version
-- ---------------------------------------------------------------------------
create function public.remove_exercise(p_exercise_id uuid, p_reason text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row    public.exercises;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Rimosso a mano');
begin
  select * into v_row from public.exercises where id = p_exercise_id for update;
  if not found then
    raise exception 'Esercizio non trovato';
  end if;
  if not coalesce(public.is_current_version(v_row.version_id), false) then
    raise exception 'Si può modificare solo la versione corrente';
  end if;

  insert into public.changes
    (version_id, exercise_id, lineage_id, action, old_value, reason, origin)
  values
    (v_row.version_id, null, v_row.lineage_id, 'remove',
     to_jsonb(v_row) - array['id', 'user_id', 'version_id', 'lineage_id', 'created_at'],
     v_reason, 'user');

  delete from public.exercises where id = p_exercise_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- move_exercise: swap an exercise with its neighbour in the same day.
-- Reordering is not logged in changes: it does not change the training.
-- ---------------------------------------------------------------------------
create function public.move_exercise(p_exercise_id uuid, p_direction text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row   public.exercises;
  v_other public.exercises;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'p_direction deve essere up o down';
  end if;

  select * into v_row from public.exercises where id = p_exercise_id for update;
  if not found then
    raise exception 'Esercizio non trovato';
  end if;

  select * into v_other from public.exercises e
  where e.version_id = v_row.version_id and e.day = v_row.day
    and case when p_direction = 'up' then e.position < v_row.position
             else e.position > v_row.position end
  order by case when p_direction = 'up' then -e.position else e.position end
  limit 1
  for update;

  if not found then
    return;  -- already first/last
  end if;

  -- the unique (version_id, day, position) constraint is deferred,
  -- so the two rows can swap positions inside this transaction
  update public.exercises set position = v_other.position where id = v_row.id;
  update public.exercises set position = v_row.position   where id = v_other.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claude API key, stored encrypted in Supabase Vault.
-- These two functions are SECURITY DEFINER because the browser role has no
-- access to the vault schema. They only ever touch the caller's own secret.
-- ---------------------------------------------------------------------------
create function public.set_api_key(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_key       text := trim(p_key);
  v_secret_id uuid;
begin
  if v_uid is null then
    raise exception 'Devi essere loggato';
  end if;
  if v_key is null or char_length(v_key) > 300 or v_key !~ '^sk-ant-[A-Za-z0-9_-]{20,}$' then
    raise exception 'La chiave non sembra una chiave API di Claude (inizia con sk-ant-)';
  end if;

  select api_key_secret_id into v_secret_id
  from public.user_settings where user_id = v_uid for update;

  if v_secret_id is not null and exists (select 1 from vault.secrets where id = v_secret_id) then
    perform vault.update_secret(v_secret_id, v_key);
  else
    v_secret_id := vault.create_secret(
      v_key,
      'claude_api_key_' || v_uid::text,
      'Claude API key of user ' || v_uid::text
    );
    update public.user_settings set api_key_secret_id = v_secret_id where user_id = v_uid;
  end if;
end;
$$;

create function public.delete_api_key()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_secret_id uuid;
begin
  if v_uid is null then
    raise exception 'Devi essere loggato';
  end if;

  select api_key_secret_id into v_secret_id
  from public.user_settings where user_id = v_uid for update;

  update public.user_settings
    set api_key_secret_id = null, ai_enabled = false
    where user_id = v_uid;

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

-- The AI can only be switched on once a key is saved.
create function public.check_ai_needs_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ai_enabled and new.api_key_secret_id is null then
    raise exception 'Inserisci prima la tua chiave API'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger user_settings_ai_needs_key
  before insert or update on public.user_settings
  for each row execute function public.check_ai_needs_key();

-- ---------------------------------------------------------------------------
-- Privileges: only signed-in users may call the app functions
-- ---------------------------------------------------------------------------
revoke execute on function
  public.is_current_version(uuid),
  public.create_plan(text),
  public.edit_exercise(uuid, jsonb, text),
  public.add_exercise(uuid, smallint, jsonb, text),
  public.remove_exercise(uuid, text),
  public.move_exercise(uuid, text),
  public.set_api_key(text),
  public.delete_api_key()
from public, anon;

grant execute on function
  public.is_current_version(uuid),
  public.create_plan(text),
  public.edit_exercise(uuid, jsonb, text),
  public.add_exercise(uuid, smallint, jsonb, text),
  public.remove_exercise(uuid, text),
  public.move_exercise(uuid, text),
  public.set_api_key(text),
  public.delete_api_key()
to authenticated;

-- trigger functions are never called directly
revoke execute on function
  public.protect_old_versions(),
  public.touch_updated_at(),
  public.check_ai_needs_key()
from public, anon, authenticated;
