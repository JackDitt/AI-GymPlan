import { useCallback, useEffect, useState } from 'react';
import { supabase, errorText } from './supabase';
import type { Plan, PlanVersion } from './types';

/** Loads a plan and the list of its versions (oldest first). */
export function usePlan(planId: string | undefined) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [versions, setVersions] = useState<PlanVersion[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    const [p, v] = await Promise.all([
      supabase.from('plans').select('*').eq('id', planId).maybeSingle(),
      supabase.from('plan_versions').select('*').eq('plan_id', planId).order('version_number'),
    ]);
    if (p.error || v.error) setError(errorText(p.error ?? v.error));
    else if (!p.data) setError('Scheda non trovata.');
    else {
      setPlan(p.data as Plan);
      setVersions(v.data as PlanVersion[]);
      setError('');
    }
    setLoading(false);
  }, [planId]);

  useEffect(() => {
    load();
  }, [load]);

  const current = versions.length ? versions[versions.length - 1] : null;
  return { plan, versions, current, error, loading, reload: load };
}
