import { useState, type FormEvent } from 'react';
import { supabase, errorText } from '../lib/supabase';
import type { EditableField, Exercise } from '../lib/types';
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from './Icons';

type Draft = Record<EditableField, string>;

const NUMERIC: EditableField[] = ['sets', 'reps_min', 'reps_max', 'load_kg', 'rest_seconds'];

function toDraft(e?: Exercise): Draft {
  const s = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v));
  return {
    name: s(e?.name),
    sets: s(e?.sets),
    reps_min: s(e?.reps_min),
    reps_max: s(e?.reps_max),
    load_kg: e?.load_kg == null ? '' : String(Number(e.load_kg)),
    rest_seconds: s(e?.rest_seconds),
    notes: s(e?.notes),
  };
}

function parse(field: EditableField, v: string): string | number | null {
  const t = v.trim();
  if (t === '') return null;
  if (NUMERIC.includes(field)) return Number(t.replace(',', '.'));
  return t;
}

interface Props {
  /** existing exercise to edit, or undefined to add a new one */
  exercise?: Exercise;
  versionId: string;
  day: number;
  focusField?: EditableField;
  onDone: (changed: boolean) => void;
}

export default function ExerciseEditor({ exercise, versionId, day, focusField = 'name', onDone }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(exercise));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isNew = !exercise;

  const set = (f: EditableField) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [f]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const before = toDraft(exercise);
    const patch: Partial<Record<EditableField, string | number | null>> = {};
    (Object.keys(draft) as EditableField[]).forEach((f) => {
      if (isNew ? draft[f].trim() !== '' : draft[f].trim() !== before[f].trim()) patch[f] = parse(f, draft[f]);
    });
    if (!isNew && Object.keys(patch).length === 0) return onDone(false);

    setBusy(true);
    setError('');
    const { error } = isNew
      ? await supabase.rpc('add_exercise', { p_version_id: versionId, p_day: day, p_data: patch, p_reason: reason || null })
      : await supabase.rpc('edit_exercise', { p_exercise_id: exercise.id, p_patch: patch, p_reason: reason || null });
    setBusy(false);
    if (error) return setError(errorText(error));
    onDone(true);
  }

  async function move(direction: 'up' | 'down') {
    if (!exercise) return;
    setBusy(true);
    const { error } = await supabase.rpc('move_exercise', { p_exercise_id: exercise.id, p_direction: direction });
    setBusy(false);
    if (error) return setError(errorText(error));
    onDone(true);
  }

  async function remove() {
    if (!exercise) return;
    if (!window.confirm(`Togliere "${exercise.name}" dalla scheda?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('remove_exercise', { p_exercise_id: exercise.id, p_reason: reason || null });
    setBusy(false);
    if (error) return setError(errorText(error));
    onDone(true);
  }

  const num = (f: EditableField, label: string, opts: { step?: string; min?: number; max?: number; suffix?: string } = {}) => (
    <label className="field">
      <span>{label}</span>
      <span className="with-suffix">
        <input
          inputMode="decimal"
          type="number"
          step={opts.step ?? '1'}
          min={opts.min}
          max={opts.max}
          value={draft[f]}
          onChange={set(f)}
          autoFocus={focusField === f}
        />
        {opts.suffix && <span className="suffix">{opts.suffix}</span>}
      </span>
    </label>
  );

  return (
    <form className="editor" onSubmit={save}>
      <div className="editor-grid">
        <label className="field span-name">
          <span>Esercizio</span>
          <input required maxLength={100} value={draft.name} onChange={set('name')} autoFocus={focusField === 'name'} />
        </label>
        {num('sets', 'Serie', { min: 1, max: 20 })}
        {num('reps_min', 'Rip. min', { min: 1, max: 100 })}
        {num('reps_max', 'Rip. max', { min: 1, max: 100 })}
        {num('load_kg', 'Carico', { step: '0.25', min: 0, max: 1000, suffix: 'kg' })}
        {num('rest_seconds', 'Recupero', { step: '15', min: 0, max: 900, suffix: 's' })}
        <label className="field span-notes">
          <span>Note</span>
          <input maxLength={500} value={draft.notes} onChange={set('notes')} autoFocus={focusField === 'notes'} />
        </label>
        <label className="field span-all">
          <span>Perché la cambi? Facoltativo, lo legge l'AI alla prossima revisione</span>
          <input maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>

      {error && <p className="msg error">{error}</p>}

      <div className="editor-actions">
        <button className="btn primary" disabled={busy}>
          {isNew ? 'Aggiungi esercizio' : 'Salva modifiche'}
        </button>
        <button type="button" className="btn" onClick={() => onDone(false)} disabled={busy}>
          Annulla
        </button>
        {!isNew && (
          <span className="editor-tools">
            <button type="button" className="icon-btn" onClick={() => move('up')} disabled={busy} aria-label="Sposta su" title="Sposta su">
              <ArrowUpIcon />
            </button>
            <button type="button" className="icon-btn" onClick={() => move('down')} disabled={busy} aria-label="Sposta giù" title="Sposta giù">
              <ArrowDownIcon />
            </button>
            <button type="button" className="icon-btn danger" onClick={remove} disabled={busy} aria-label="Togli dalla scheda" title="Togli dalla scheda">
              <TrashIcon />
            </button>
          </span>
        )}
      </div>
    </form>
  );
}
