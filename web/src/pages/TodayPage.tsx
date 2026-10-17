import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { useActivePlan } from '../lib/useActivePlan';
import {
  DAYS,
  WEEKDAY_LETTERS,
  dayName,
  fmtDayMonth,
  fmtLongDate,
  groupByDay,
  nextDateOf,
  todayIso,
  weekdayOf,
} from '../lib/format';
import type { Exercise, WorkoutLog } from '../lib/types';
import TodayExercise from '../components/TodayExercise';

/** The page the app opens on: what to do today, nothing else. */
export default function TodayPage() {
  const { settings, plans, active, error: planError, loading } = useActivePlan();
  const [params, setParams] = useSearchParams();

  const today = weekdayOf();
  const asked = Number(params.get('day'));
  const day = DAYS.includes(asked) ? asked : today;

  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [reviewOnPain, setReviewOnPain] = useState(false);
  const [error, setError] = useState('');

  const versionId = active?.latest?.id;
  const planId = active?.id;

  const load = useCallback(async () => {
    if (!versionId || !planId) return;
    const [ex, lg, rules] = await Promise.all([
      supabase.from('exercises').select('*').eq('version_id', versionId).order('day').order('position'),
      supabase
        .from('workout_logs')
        .select('*, exercises!inner(lineage_id, version_id)')
        .eq('exercises.version_id', versionId)
        .eq('performed_on', todayIso())
        .order('created_at', { ascending: false }),
      supabase.from('plan_rules').select('review_on_pain').eq('plan_id', planId).maybeSingle(),
    ]);
    const err = ex.error ?? lg.error ?? rules.error;
    if (err) return setError(errorText(err));
    setExercises(ex.data as Exercise[]);
    setLogs(lg.data as WorkoutLog[]);
    setReviewOnPain(!!(rules.data as { review_on_pain: boolean } | null)?.review_on_pain);
    setError('');
  }, [versionId, planId]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => groupByDay(exercises ?? []), [exercises]);

  // latest log of today for each exercise
  const logOf = useMemo(() => {
    const m = new Map<string, WorkoutLog>();
    for (const l of logs) if (!m.has(l.exercise_id)) m.set(l.exercise_id, l);
    return m;
  }, [logs]);

  const pick = (d: number) => setParams(d === today ? {} : { day: String(d) }, { replace: true });

  if (planError) return <p className="msg error">{planError}</p>;
  if (loading || (active?.latest && exercises === null && !error)) return <p className="page-status">Caricamento…</p>;

  if (!plans?.length || !active) {
    return (
      <div className="today-empty">
        <h1>Nessuna scheda</h1>
        <p className="lead">Crea la tua scheda: scegli i giorni in cui ti alleni e aggiungi gli esercizi.</p>
        <Link to="/plans" className="btn primary">
          Crea la scheda
        </Link>
      </div>
    );
  }

  const rows = byDay.get(day) ?? [];
  const done = rows.filter((e) => logOf.has(e.id)).length;
  const painReview = reviewOnPain && !!settings?.ai_enabled;

  // next day with a workout, after the one shown
  const nextDay = DAYS.map((i) => ((day - 1 + i) % 7) + 1).find((d) => (byDay.get(d)?.length ?? 0) > 0);

  return (
    <div className="today">
      <header className="today-head">
        <p className="today-date">{day === today ? `Oggi, ${fmtDayMonth(new Date())}` : `Oggi è ${fmtLongDate()}`}</p>
        <h1 className="today-day">{dayName(day)}</h1>
        <p className="today-plan">
          {active.name}
          {plans.length > 1 && (
            <>
              {' · '}
              <Link to="/plans">cambia</Link>
            </>
          )}
        </p>
        {rows.length > 0 && (
          <p className={`today-progress${done === rows.length ? ' complete' : ''}`} aria-live="polite">
            {done === rows.length ? 'Allenamento finito' : `${done} di ${rows.length} fatti`}
          </p>
        )}
      </header>

      <nav className="week-strip" aria-label="Giorni della settimana">
        {DAYS.map((d) => {
          const n = byDay.get(d)?.length ?? 0;
          return (
            <button
              key={d}
              type="button"
              className={`ws-day${d === today ? ' is-today' : ''}${n === 0 ? ' rest' : ''}`}
              aria-pressed={d === day}
              aria-label={`${dayName(d)}${d === today ? ', oggi' : ''}: ${n ? `${n} esercizi` : 'riposo'}`}
              onClick={() => pick(d)}
            >
              <span className="ws-letter">{WEEKDAY_LETTERS[d - 1]}</span>
              <span className="ws-count">{n || '–'}</span>
            </button>
          );
        })}
      </nav>

      {day !== today && rows.length > 0 && (
        <div className="banner moved">
          <p>
            Stai facendo l'allenamento di <strong>{dayName(day).toLowerCase()}</strong>. Il feedback viene salvato con la data
            di oggi.
          </p>
          <button type="button" className="btn" onClick={() => pick(today)}>
            Torna a oggi
          </button>
        </div>
      )}

      {error && <p className="msg error">{error}</p>}

      {rows.length > 0 ? (
        <ol className="today-list">
          {rows.map((e, i) => (
            <TodayExercise
              key={e.id}
              index={i + 1}
              exercise={e}
              log={logOf.get(e.id) ?? null}
              painReview={painReview}
              onChanged={load}
            />
          ))}
        </ol>
      ) : (
        <div className="rest-day">
          <p className="rest-title">Riposo</p>
          {nextDay ? (
            <>
              <p>
                Prossimo allenamento: {dayName(nextDay).toLowerCase()} {fmtDayMonth(nextDateOf(nextDay))},{' '}
                {byDay.get(nextDay)!.length} esercizi.
              </p>
              <button type="button" className="btn" onClick={() => pick(nextDay)}>
                {day === today ? 'Allenati lo stesso: ' : 'Vedi '}
                {dayName(nextDay).toLowerCase()}
              </button>
            </>
          ) : (
            <>
              <p>La scheda è vuota.</p>
              <Link to="/week" className="btn primary">
                Aggiungi gli esercizi
              </Link>
            </>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <p className="hint legend">
          <strong>Fatto</strong> registra l'esercizio come scritto in scheda. Se è andata diversamente, o hai sentito dolore,
          tocca la nota accanto.
        </p>
      )}
    </div>
  );
}
