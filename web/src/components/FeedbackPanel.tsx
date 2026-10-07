import { useState, type FormEvent } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { fmtDate, fmtLoad, fmtNumber, todayIso } from '../lib/format';
import type { Exercise, WorkoutLog } from '../lib/types';
import { TrashIcon } from './Icons';

interface Props {
  exercise: Exercise;
  logs: WorkoutLog[]; // all logs of this exercise across versions, newest first
  canLog: boolean;
  onChanged: () => void;
}

export default function FeedbackPanel({ exercise, logs, canLog, onChanged }: Props) {
  const [date, setDate] = useState(todayIso());
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [load, setLoad] = useState('');
  const [rpe, setRpe] = useState('');
  const [pain, setPain] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.from('workout_logs').insert({
      exercise_id: exercise.id,
      performed_on: date,
      sets_done: n(sets),
      reps_done: n(reps),
      load_kg_done: n(load),
      rpe: n(rpe),
      pain,
      comment: comment.trim() || null,
    });
    setBusy(false);
    if (error) return setError(errorText(error));
    setSets('');
    setReps('');
    setLoad('');
    setRpe('');
    setPain(false);
    setComment('');
    setSaved(true);
    onChanged();
  }

  async function remove(id: string) {
    if (!window.confirm('Cancellare questo feedback?')) return;
    const { error } = await supabase.from('workout_logs').delete().eq('id', id);
    if (error) return setError(errorText(error));
    onChanged();
  }

  return (
    <div className="feedback">
      {canLog && (
        <form className="feedback-form" onSubmit={save}>
          <div className="feedback-grid">
            <label className="field">
              <span>Data</span>
              <input type="date" required value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Serie fatte</span>
              <input type="number" inputMode="numeric" min={0} max={20} placeholder={fmtNumber(exercise.sets)} value={sets} onChange={(e) => setSets(e.target.value)} />
            </label>
            <label className="field">
              <span>Ripetizioni</span>
              <input type="number" inputMode="numeric" min={0} max={100} placeholder={fmtNumber(exercise.reps_max ?? exercise.reps_min)} value={reps} onChange={(e) => setReps(e.target.value)} />
            </label>
            <label className="field">
              <span>Carico (kg)</span>
              <input type="number" inputMode="decimal" min={0} max={1000} step="0.25" placeholder={fmtNumber(exercise.load_kg)} value={load} onChange={(e) => setLoad(e.target.value)} />
            </label>
            <label className="field">
              <span title="Sforzo percepito: 10 = non ne avevi più">RPE (1–10)</span>
              <input type="number" inputMode="decimal" min={1} max={10} step="0.5" value={rpe} onChange={(e) => setRpe(e.target.value)} />
            </label>
            <label className="check pain-check">
              <input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} />
              <span>Dolore, non fatica</span>
            </label>
            <label className="field span-all">
              <span>Come è andata</span>
              <textarea rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Es. ultima serie lenta, il gomito tira" />
            </label>
          </div>
          {error && <p className="msg error">{error}</p>}
          <div className="feedback-actions">
            <button className="btn primary" disabled={busy}>
              Salva feedback
            </button>
            {saved && <span className="msg ok inline">Feedback salvato</span>}
          </div>
        </form>
      )}

      {logs.length > 0 ? (
        <ul className="log-list">
          {logs.slice(0, 8).map((l) => (
            <li key={l.id} className={l.pain ? 'pain' : undefined}>
              <span className="log-date">{fmtDate(l.performed_on)}</span>
              <span className="log-numbers">
                {[
                  l.sets_done != null && l.reps_done != null ? `${l.sets_done}×${l.reps_done}` : l.sets_done != null ? `${l.sets_done} serie` : l.reps_done != null ? `${l.reps_done} rip.` : '',
                  fmtLoad(l.load_kg_done),
                  l.rpe != null ? `RPE ${fmtNumber(l.rpe)}` : '',
                ]
                  .filter(Boolean)
                  .join('  ')}
              </span>
              {l.pain && <span className="pain-tag">dolore</span>}
              {l.comment && <span className="log-comment">{l.comment}</span>}
              {canLog && (
                <button type="button" className="icon-btn small" onClick={() => remove(l.id)} aria-label="Cancella feedback" title="Cancella">
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !canLog && <p className="hint">Nessun feedback per questo esercizio.</p>
      )}
    </div>
  );
}
