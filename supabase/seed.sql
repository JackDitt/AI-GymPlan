-- AI-GymPlan: example data for LOCAL development only.
-- Runs automatically on `supabase start` (first time) and on `supabase db reset`.
-- It is never applied to the hosted database.
--
-- Demo login:  demo@example.com  /  demo-password

-- 1. Demo user (signing up through the app does this for real users)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'demo@example.com',
  extensions.crypt('demo-password', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"demo@example.com"}',
  'email', now(), now(), now()
);
-- (user_settings is created by the on_auth_user_created trigger)

-- 2. An invented 3-day full-body plan
insert into public.plans (id, user_id, name) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Full body 3 giorni');

insert into public.plan_rules (plan_id, user_id, split, days_per_week, goal, max_changes_per_review, extra_rules) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Full body A/B/C', 3, 'Forza e ipertrofia generale', 3,
   'Non togliere lo squat. Una settimana di scarico ogni 6.');

-- Version 1: the plan written by the user two weeks ago
insert into public.plan_versions (id, user_id, plan_id, version_number, created_by, summary, created_at) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 1, 'user', 'Scheda iniziale', now() - interval '14 days');

insert into public.exercises
  (user_id, version_id, day, position, name, sets, reps_min, reps_max, load_kg, rest_seconds, notes, locked)
values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 1, 1, 'Squat',              4, 6, 8,   60,  150, null, true),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 1, 2, 'Panca piana',        4, 6, 8,   50,  150, null, false),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 1, 3, 'Rematore manubrio',  3, 8, 12,  22,   90, 'Per braccio', false),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 2, 1, 'Stacco rumeno',      3, 8, 10,  60,  120, null, false),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 2, 2, 'Military press',     3, 6, 8,   30,  120, null, false),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 2, 3, 'Lat machine',        3, 10, 12, 45,   90, null, false),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 3, 1, 'Leg press',          3, 10, 12, 120,  120, null, false),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 3, 2, 'Panca inclinata manubri', 3, 8, 10, 18, 90, null, false),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 3, 3, 'Plank',              3, null, null, null, 60, '45 secondi', false);

-- Feedback written during the first week
insert into public.workout_logs (user_id, exercise_id, performed_on, sets_done, reps_done, load_kg_done, rpe, comment, pain)
select e.user_id, e.id, current_date - 10, 4, 8, 50, 7, 'Facile, prossima volta salirei', false
from public.exercises e where e.version_id = '33333333-3333-3333-3333-333333333333' and e.name = 'Panca piana';

insert into public.workout_logs (user_id, exercise_id, performed_on, sets_done, reps_done, load_kg_done, rpe, comment, pain)
select e.user_id, e.id, current_date - 9, 3, 6, 30, 9.5, 'Fastidio alla spalla destra', true
from public.exercises e where e.version_id = '33333333-3333-3333-3333-333333333333' and e.name = 'Military press';

-- 3. Version 2: an example of what the weekly AI review will produce (Phase 3).
--    Exercises are copied with the same lineage_id, two of them changed.
insert into public.plan_versions (id, user_id, plan_id, version_number, created_by, summary, created_at) values
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 2, 'ai',
   'Carico in panca aumentato; military press sostituita per il fastidio alla spalla.',
   now() - interval '7 days');

insert into public.exercises
  (user_id, version_id, lineage_id, day, position, name, sets, reps_min, reps_max, load_kg, rest_seconds, notes, locked)
select user_id, '44444444-4444-4444-4444-444444444444', lineage_id, day, position,
  case when name = 'Military press' then 'Landmine press' else name end,
  sets, reps_min, reps_max,
  case when name = 'Panca piana' then 52.5
       when name = 'Military press' then 20
       else load_kg end,
  rest_seconds,
  case when name = 'Military press' then 'Un braccio alla volta' else notes end,
  locked
from public.exercises where version_id = '33333333-3333-3333-3333-333333333333';

insert into public.changes
  (user_id, version_id, exercise_id, lineage_id, action, field, old_value, new_value, reason, origin, created_at)
select e2.user_id, e2.version_id, e2.id, e2.lineage_id, 'update', 'load_kg', '50', '52.5',
  'RPE 7 con tutte le ripetizioni: c''è margine per salire di 2,5 kg.', 'ai', now() - interval '7 days'
from public.exercises e2
where e2.version_id = '44444444-4444-4444-4444-444444444444' and e2.name = 'Panca piana';

insert into public.changes
  (user_id, version_id, exercise_id, lineage_id, action, field, old_value, new_value, reason, origin, created_at)
select e2.user_id, e2.version_id, e2.id, e2.lineage_id, 'replace', null,
  '{"name": "Military press", "load_kg": 30, "notes": null}',
  '{"name": "Landmine press", "load_kg": 20, "notes": "Un braccio alla volta"}',
  'Dolore alla spalla segnalato: sostituito con una spinta più gentile per la spalla. Se il fastidio continua, fatti vedere da un professionista.',
  'ai', now() - interval '7 days'
from public.exercises e2
where e2.version_id = '44444444-4444-4444-4444-444444444444' and e2.name = 'Landmine press';

-- Feedback written this week, on the current version
insert into public.workout_logs (user_id, exercise_id, performed_on, sets_done, reps_done, load_kg_done, rpe, comment, pain)
select e.user_id, e.id, current_date - 2, 4, 7, 52.5, 8, 'Ultima serie dura ma pulita', false
from public.exercises e where e.version_id = '44444444-4444-4444-4444-444444444444' and e.name = 'Panca piana';

insert into public.workout_logs (user_id, exercise_id, performed_on, sets_done, reps_done, load_kg_done, rpe, comment, pain)
select e.user_id, e.id, current_date - 1, 3, 8, 20, 7, 'Nessun fastidio', false
from public.exercises e where e.version_id = '44444444-4444-4444-4444-444444444444' and e.name = 'Landmine press';
