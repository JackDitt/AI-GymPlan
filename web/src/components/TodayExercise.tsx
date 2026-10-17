import { useState, type FormEvent } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { fmtLoad, fmtNumber, fmtReps, fmtRest, todayIso } from '../lib/format';
import type { Exercise, WorkoutLog } from '../lib/types';
import { CheckIcon, NoteIcon } from './Icons';

interface Props {
  index: number;
  exercise: Exercise;
  log: WorkoutLog | null; // today's feedback for this exercise, if any
  painReview: boolean; // the AI reviews the plan tonight if pain is logged
  onChanged: () => void;
}

/** What the plan asks for, as it is written in the gym: 4 × 6–8 · 60 kg · rec. 2'30" */
function Target({ e }: { e: Exercise }) {
  const reps = fmtReps(e.reps_min, e.reps_max);
  return (
    <p className="te-target">
      {e.sets != null && (
        <span className="te-sets">
          {reps ? (
            <>
              {e.sets} × {reps}
            </>
          ) : (
            <>{e.sets} serie</>
          )}
        </span>
      )}
      {e.sets == null && reps && <span className="te-sets">{reps} rip.</span>}
      {e.load_kg != null && <span className="te-load">{fmtLoad(e.load_kg)}</span>}
      {e.rest_seconds != null && <span className="te-rest">rec. {fmtRest(e.rest_seconds)}</span>}
    </p>
  );
}

function logSummary(l: WorkoutLog): string {
  return [
    l.sets_done != null && l.reps_done != null
      ? `${l.sets_done}×${l.reps_done}`
      : l.sets_done != null
        ? `${l.sets_done} serie`
        : l.reps_done != null
          ? `${l.reps_done} rip.`
          : '',
    fmtLoad(l.load_kg_done),
    l.rpe != null ? `RPE ${fmtNumber(l.rpe)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const str = (v: number | null | undefined) => (v == null ? '' : String(Number(v)));
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

export default function TodayExercise({ index, exercise: e, log, painReview, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // the form starts from what was logged, or from what the plan asks for
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [load, setLoad] = useState('');
  const [rpe, setRpe] = useState('');
  const [pain, setPain] = useState(false);
  const [comment, setComment] = useState('');

  function openForm() {
    setSets(str(log ? log.sets_done : e.sets));
    setReps(str(log ? log.reps_done : (e.reps_max ?? e.reps_min)));
    setLoad(str(log ? log.load_kg_done : e.load_kg));
    setRpe(str(log?.rpe));
    setPain(log?.pain ?? false);
    setComment(log?.comment ?? '');
    setError('');
    setOpen(true);
  }

  // one tap: done as written in the plan
  async function markDone() {
    setBusy(true);
    setError('');
    const { error } = await supabase.from('workout_logs').insert({
      exercise_id: e.id,
      performed_on: todayIso(),
      sets_done: e.sets,
      reps_done: e.reps_max ?? e.reps_min,
      load_kg_done: e.load_kg,
    });
    setBusy(false);
    if (error) return setError(errorText(error));
    onChanged();
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError('');
    const row = {
      sets_done: num(sets),
      reps_done: num(reps),
      load_kg_done: num(load),
      rpe: num(rpe),
      pain,
      comment: comment.trim() || null,
    };
    const { error } = log
      ? await supabase.from('workout_logs').update(row).eq('id', log.id)
      : await supabase.from('workout_logs').insert({ ...row, exercise_id: e.id, performed_on: todayIso() });
    setBusy(false);
    if (error) return setError(errorText(error));
    setOpen(false);
    onChanged();
  }

  async function undo() {
    if (!log) return;
    setBusy(true);
    const { error } = await supabase.from('workout_logs').delete().eq('id', log.id);
    setBusy(false);
    if (error) return setError(errorText(error));
    setOpen(false);
    onChanged();
  }

  return (
    <li className={`today-ex${log ? ' done' : ''}${open ? ' open' : ''}`}>
      <div className="te-row">
        <span className="te-idx" aria-hidden="true">
          {log ? <CheckIcon /> : index}
        </span>
        <div className="te-body">
          <p className="te-name">{e.name}</p>
          <Target e={e} />
          {e.notes && <p className="te-notes">{e.notes}</p>}
          {log && (
            <p className="te-log">
              <span className="sr-only">Fatto: </span>
              {logSummary(log) || 'Fatto'}
              {log.pain && <span className="pain-tag"> dolore</span>}
              {log.comment && <span className="te-comment"> — {log.comment}</span>}
            </p>
          )}
        </div>
        <div className="te-actions">
          {!log && (
            <button type="button" className="btn te-done" disabled={busy} onClick={markDone} aria-label={`${e.name}: fatto come da scheda`}>
              Fatto
            </button>
          )}
          <button
            type="button"
            className={`icon-btn${open ? ' on' : ''}`}
            onClick={() => (open ? setOpen(false) : openForm())}
            aria-expanded={open}
            aria-label={log ? `Correggi o aggiungi note a ${e.name}` : `Scrivi com'è andata ${e.name}`}
            title={log ? 'Correggi, note, dolore' : 'Com’è andata'}
          >
            <NoteIcon />
          </button>
        </div>
      </div>

      {error && !open && <p className="msg error te-msg">{error}</p>}

      {open && (
        <form className="te-form" onSubmit={save}>
          <div className="te-grid">
            <label className="field">
              <span>Serie</span>
              <input type="number" inputMode="numeric" min={0} max={20} value={sets} onChange={(ev) => setSets(ev.target.value)} />
            </label>
            <label className="field">
              <span>Ripetizioni</span>
              <input type="number" inputMode="numeric" min={0} max={100} value={reps} onChange={(ev) => setReps(ev.target.value)} />
            </label>
            <label className="field">
              <span>Carico (kg)</span>
              <input type="number" inputMode="decimal" min={0} max={1000} step="0.25" value={load} onChange={(ev) => setLoad(ev.target.value)} />
            </label>
            <label className="field">
              <span title="Sforzo percepito: 10 = non ne avevi più">RPE (1–10)</span>
              <input type="number" inputMode="decimal" min={1} max={10} step="0.5" value={rpe} onChange={(ev) => setRpe(ev.target.value)} />
            </label>
            <label className="check pain-check span-all">
              <input type="checkbox" checked={pain} onChange={(ev) => setPain(ev.target.checked)} />
              <span>Dolore, non fatica</span>
            </label>
            {pain && (
              <p className="hint span-all pain-hint">
                {painReview
                  ? "Stanotte l'AI rivede la scheda, così domani trovi l'esercizio alleggerito o sostituito."
                  : "Alla prossima revisione l'AI alleggerisce o sostituisce l'esercizio."}{' '}
                Se il dolore continua, fatti vedere da un professionista.
              </p>
            )}
            <label className="field span-all">
              <span>Come è andata</span>
              <textarea rows={2} maxLength={1000} value={comment} onChange={(ev) => setComment(ev.target.value)} placeholder="Es. ultima serie lenta, il ginocchio tira" />
            </label>
          </div>
          {error && <p className="msg error">{error}</p>}
          <div className="feedback-actions">
            <button className="btn primary" disabled={busy}>
              Salva
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
              Chiudi
            </button>
            {log && (
              <button type="button" className="btn ghost te-undo" disabled={busy} onClick={undo}>
                Non l'ho fatto
              </button>
            )}
          </div>
        </form>
      )}
    </li>
  );
}
