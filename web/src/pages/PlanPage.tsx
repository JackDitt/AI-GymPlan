import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { usePlan } from '../lib/usePlan';
import { fmtDate } from '../lib/format';
import type { Exercise, WorkoutLog } from '../lib/types';
import PlanHeader from '../components/PlanHeader';
import ExerciseTable from '../components/ExerciseTable';

export default function PlanPage() {
  const { planId, versionNumber } = useParams();
  const { plan, versions, current, error: planError, loading } = usePlan(planId);
  const version = versionNumber ? versions.find((v) => v.version_number === Number(versionNumber)) : current;
  const editable = !!version && version.id === current?.id;

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [error, setError] = useState('');

  const versionIds = useMemo(() => versions.map((v) => v.id), [versions]);

  const load = useCallback(async () => {
    if (!version) return;
    const [ex, lg] = await Promise.all([
      supabase.from('exercises').select('*').eq('version_id', version.id).order('day').order('position'),
      // feedback of every version of this plan, so an exercise keeps its history
      // when the AI carries it over to a new version (same lineage_id)
      supabase
        .from('workout_logs')
        .select('*, exercises!inner(lineage_id, version_id)')
        .in('exercises.version_id', versionIds)
        .order('performed_on', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
    const err = ex.error ?? lg.error;
    if (err) return setError(errorText(err));
    setExercises(ex.data as Exercise[]);
    setLogs(lg.data as WorkoutLog[]);
    setError('');
  }, [version, versionIds]);

  useEffect(() => {
    load();
  }, [load]);

  const logsByLineage = useMemo(() => {
    const m = new Map<string, WorkoutLog[]>();
    for (const l of logs) {
      const key = l.exercises!.lineage_id;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(l);
    }
    return m;
  }, [logs]);

  if (loading && !plan) return <p className="page-status">Caricamento…</p>;
  if (planError) return <p className="msg error">{planError}</p>;
  if (!plan) return null;
  if (!version) return <p className="msg error">Versione {versionNumber} non trovata.</p>;

  return (
    <>
      <PlanHeader plan={plan} current={current} />

      {!editable && (
        <div className="banner old">
          <p>
            Stai guardando la <strong>versione {version.version_number}</strong> del {fmtDate(version.created_at)}. Le versioni
            precedenti non si modificano.
          </p>
          <Link to={`/plans/${plan.id}`} className="btn">
            Vai alla scheda attuale
          </Link>
        </div>
      )}

      {editable && <p className="plan-meta-line">Aggiornata il {fmtDate(version.created_at)}</p>}

      {error && <p className="msg error">{error}</p>}

      {exercises.length === 0 && editable && (
        <p className="lead">
          La scheda è vuota. Aggiungi il primo esercizio del giorno 1: per ognuno puoi indicare serie, ripetizioni, carico e
          recupero.
        </p>
      )}

      <ExerciseTable
        key={version.id}
        versionId={version.id}
        exercises={exercises}
        changes={[]}
        logsByLineage={logsByLineage}
        editable={editable}
        onChanged={load}
      />

      {editable && exercises.length > 0 && (
        <p className="hint legend">
          Tocca una casella per modificarla. Il lucchetto blocca un esercizio: l'AI non lo cambierà. Quello che è cambiato
          rispetto alla settimana prima lo trovi in Confronta.
        </p>
      )}
    </>
  );
}
