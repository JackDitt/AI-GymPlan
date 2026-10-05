-- AI-GymPlan: initial schema (Phase 1)
--
-- Every table carries user_id and has Row Level Security enabled:
-- a signed-in user can only read and write their own rows.
-- Child tables reference their parent with (id, user_id) composite foreign keys,
-- so a row can never point at another user's plan, version or exercise.

-- ---------------------------------------------------------------------------
-- plans: one training plan (a user can have more than one)
-- ---------------------------------------------------------------------------
create table public.plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- plan_versions: each weekly review creates a new version (a new page).
-- Old versions are never overwritten.
-- ---------------------------------------------------------------------------
create table public.plan_versions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  plan_id         uuid not null,
  version_number  integer not null check (version_number >= 1),
  created_by      text not null default 'user' check (created_by in ('user', 'ai')),
  summary         text,                     -- short description of what changed
  created_at      timestamptz not null default now(),
  unique (plan_id, version_number),
  unique (id, user_id),
  foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- exercises: one row per exercise inside a version.
-- lineage_id stays the same when an exercise is carried over to the next
-- version, so old and new versions can be compared side by side.
-- ---------------------------------------------------------------------------
create table public.exercises (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid(),
  version_id    uuid not null,
  lineage_id    uuid not null default gen_random_uuid(),
  day           smallint not null check (day between 1 and 7),
  position      smallint not null check (position >= 1),
  name          text not null check (char_length(name) between 1 and 100),
  sets          smallint check (sets between 1 and 20),
  reps_min      smallint check (reps_min between 1 and 100),
  reps_max      smallint check (reps_max between 1 and 100),
  load_kg       numeric(6, 2) check (load_kg >= 0 and load_kg <= 1000),
  rest_seconds  smallint check (rest_seconds between 0 and 900),
  notes         text check (char_length(notes) <= 500),
  locked        boolean not null default false,   -- the AI may not touch locked rows
  created_at    timestamptz not null default now(),
  check (reps_max is null or reps_min is null or reps_max >= reps_min),
  unique (version_id, day, position) deferrable initially deferred,
  unique (version_id, lineage_id),
  unique (id, user_id),
  foreign key (version_id, user_id) references public.plan_versions (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- workout_logs: feedback written next to each exercise.
-- Only exercise and date are required; everything else is optional.
-- ---------------------------------------------------------------------------
create table public.workout_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid(),
  exercise_id   uuid not null,
  performed_on  date not null default current_date,
  sets_done     smallint check (sets_done between 0 and 20),
  reps_done     smallint check (reps_done between 0 and 100),
  load_kg_done  numeric(6, 2) check (load_kg_done >= 0 and load_kg_done <= 1000),
  rpe           numeric(3, 1) check (rpe between 1 and 10),
  comment       text check (char_length(comment) <= 1000),
  pain          boolean not null default false,  -- pain, not fatigue
  created_at    timestamptz not null default now(),
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- changes: the changelog. Every change, by the AI or by the user, gets a row
-- with a reason, so the next review knows what was done and what was rejected.
-- ---------------------------------------------------------------------------
create table public.changes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  version_id     uuid not null,             -- version where the change was applied
  exercise_id    uuid,                      -- null if the exercise was removed
  lineage_id     uuid,                      -- follows the exercise across versions
  action         text not null check (action in ('update', 'replace', 'add', 'remove')),
  field          text,                      -- e.g. 'sets', 'load_kg' (null for add/remove/replace)
  old_value      jsonb,
  new_value      jsonb,
  reason         text not null check (char_length(reason) between 1 and 1000),
  origin         text not null check (origin in ('ai', 'user')),
  status         text not null default 'applied' check (status in ('applied', 'reverted')),
  revert_reason  text check (char_length(revert_reason) <= 1000),
  reverted_at    timestamptz,
  created_at     timestamptz not null default now(),
  check ((status = 'reverted') = (reverted_at is not null)),
  foreign key (version_id, user_id) references public.plan_versions (id, user_id) on delete cascade,
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete set null (exercise_id)
);

-- ---------------------------------------------------------------------------
-- plan_rules: the user's fixed constraints for a plan, passed to the AI.
-- ---------------------------------------------------------------------------
create table public.plan_rules (
  plan_id                 uuid primary key,
  user_id                 uuid not null default auth.uid(),
  split                   text check (char_length(split) <= 100),   -- e.g. 'Push/Pull/Legs'
  days_per_week           smallint check (days_per_week between 1 and 7),
  goal                    text check (char_length(goal) <= 300),
  max_changes_per_review  smallint not null default 3 check (max_changes_per_review between 0 and 10),
  extra_rules             text check (char_length(extra_rules) <= 2000),
  updated_at              timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- user_settings: one row per user, created automatically at sign-up.
-- The API key itself will live encrypted in Supabase Vault (Phase 5);
-- here we only keep the reference to that secret.
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  ai_enabled          boolean not null default false,
  api_key_secret_id   uuid,
  last_review_at      timestamptz,
  last_review_status  text check (last_review_status in ('ok', 'skipped', 'error')),
  last_review_error   text,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes on the columns used for lookups and joins
-- ---------------------------------------------------------------------------
create index on public.plans (user_id);
create index on public.plan_versions (user_id);
create index on public.exercises (user_id);
create index on public.workout_logs (user_id);
create index on public.workout_logs (exercise_id, performed_on);
create index on public.changes (user_id);
create index on public.changes (version_id);
create index on public.changes (lineage_id);
create index on public.plan_rules (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: each user sees and edits only their own rows
-- ---------------------------------------------------------------------------
alter table public.plans         enable row level security;
alter table public.plan_versions enable row level security;
alter table public.exercises     enable row level security;
alter table public.workout_logs  enable row level security;
alter table public.changes       enable row level security;
alter table public.plan_rules    enable row level security;
alter table public.user_settings enable row level security;

create policy "own rows" on public.plans
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own rows" on public.plan_versions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own rows" on public.exercises
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own rows" on public.workout_logs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own rows" on public.changes
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own rows" on public.plan_rules
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- user_settings: users can read and update their row, but not create or delete it
-- (the sign-up trigger below creates it).
create policy "read own settings" on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "update own settings" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Review bookkeeping and the key reference are written only by the backend
-- (Edge Function with the service role), never from the browser.
revoke update on public.user_settings from authenticated, anon;
grant update (ai_enabled) on public.user_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Create the user_settings row automatically when someone signs up
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
