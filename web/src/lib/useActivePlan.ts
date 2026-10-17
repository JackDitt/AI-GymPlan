import { useCallback, useEffect, useState } from 'react';
import { supabase, errorText } from './supabase';
import { browserTimeZone } from './format';
import type { Plan, PlanVersion, UserSettings } from './types';

export interface PlanWithLatest extends Plan {
  latest: PlanVersion | null;
}

/**
 * The user's settings, their plans (each with its latest version) and the
 * plan the app opens on: the one chosen in Schede, or the oldest one.
 */
export function useActivePlan() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [plans, setPlans] = useState<PlanWithLatest[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      supabase.from('user_settings').select('*').maybeSingle(),
      supabase.from('plans').select('id, name, created_at, plan_versions(*)').order('created_at'),
    ]);
    const err = s.error ?? p.error;
    if (err) return setError(errorText(err));

    const st = s.data as UserSettings | null;
    setSettings(st);
    setPlans(
      (p.data as (Plan & { plan_versions: PlanVersion[] })[]).map(({ plan_versions, ...plan }) => ({
        ...plan,
        latest: plan_versions.reduce<PlanVersion | null>((a, v) => (!a || v.version_number > a.version_number ? v : a), null),
      })),
    );
    setError('');

    // reviews run at night in the user's time zone: keep it in step with this device
    const tz = browserTimeZone();
    if (st && st.timezone !== tz) {
      supabase
        .from('user_settings')
        .update({ timezone: tz })
        .eq('user_id', st.user_id)
        .then(({ error }) => {
          if (!error) setSettings((cur) => (cur ? { ...cur, timezone: tz } : cur));
        });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = plans ? (plans.find((p) => p.id === settings?.active_plan_id) ?? plans[0] ?? null) : null;

  async function setActive(planId: string) {
    if (!settings) return;
    const { error } = await supabase.from('user_settings').update({ active_plan_id: planId }).eq('user_id', settings.user_id);
    if (error) return setError(errorText(error));
    setSettings({ ...settings, active_plan_id: planId });
  }

  return { settings, plans, active, error, loading: plans === null && !error, reload: load, setActive };
}
