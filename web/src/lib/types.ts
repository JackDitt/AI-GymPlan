// Row shapes of the tables in supabase/migrations (kept by hand for now;
// `npx supabase gen types typescript --local` can generate them later).

export interface Plan {
  id: string;
  name: string;
  created_at: string;
}

export interface PlanVersion {
  id: string;
  plan_id: string;
  version_number: number;
  created_by: 'user' | 'ai';
  summary: string | null;
  created_at: string;
}

export interface Exercise {
  id: string;
  version_id: string;
  lineage_id: string;
  day: number;
  position: number;
  name: string;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  load_kg: number | null;
  rest_seconds: number | null;
  notes: string | null;
  locked: boolean;
}

export type EditableField = 'name' | 'sets' | 'reps_min' | 'reps_max' | 'load_kg' | 'rest_seconds' | 'notes';

export interface WorkoutLog {
  id: string;
  exercise_id: string;
  performed_on: string;
  sets_done: number | null;
  reps_done: number | null;
  load_kg_done: number | null;
  rpe: number | null;
  comment: string | null;
  pain: boolean;
  created_at: string;
  exercises?: { lineage_id: string; version_id: string };
}

export interface Change {
  id: string;
  version_id: string;
  exercise_id: string | null;
  lineage_id: string | null;
  action: 'update' | 'replace' | 'add' | 'remove';
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string;
  origin: 'ai' | 'user';
  status: 'applied' | 'reverted';
  revert_reason: string | null;
  created_at: string;
}

export interface PlanRules {
  plan_id: string;
  split: string | null;
  days_per_week: number | null;
  goal: string | null;
  max_changes_per_review: number;
  extra_rules: string | null;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  ai_enabled: boolean;
  api_key_secret_id: string | null;
  last_review_at: string | null;
  last_review_status: 'ok' | 'skipped' | 'error' | null;
  last_review_error: string | null;
}
