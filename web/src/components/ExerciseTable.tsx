import { Fragment, useState } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { fmtLoad, fmtNumber, fmtReps, fmtRest, groupByDay } from '../lib/format';
import type { Change, EditableField, Exercise, WorkoutLog } from '../lib/types';
import ExerciseEditor from './ExerciseEditor';
import FeedbackPanel from './FeedbackPanel';
import { LockIcon, NoteIcon, PencilIcon } from './Icons';

interface Props {
  versionId: string;
  exercises: Exercise[];
  changes: Change[]; // applied changes that created this version (for highlights)
  logsByLineage: Map<string, WorkoutLog[]>;
  editable: boolean;
  onChanged: () => void;
}

type Open = { kind: 'row'; id: string; mode: 'edit' | 'feedback'; field?: EditableField } | { kind: 'new'; day: number } | null;

const COLS = 7;

export default function ExerciseTable({ versionId, exercises, changes, logsByLineage, editable, onChanged }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const [error, setError] = useState('');

  // which cells changed in this version, and why
  const changed = new Map<string, Map<string, Change>>();
  for (const c of changes) {
    if (!c.lineage_id || c.status !== 'applied') continue;
    if (!changed.has(c.lineage_id)) changed.set(c.lineage_id, new Map());
    const key = c.action === 'update' ? (c.field === 'reps_min' || c.field === 'reps_max' ? 'reps' : c.field ?? '*') : '*';
    changed.get(c.lineage_id)!.set(key, c);
  }
  // props for a cell: its base class plus the highlight, and the reason as tooltip
  const mark = (e: Exercise, key: string, base: string) => {
    const c = changed.get(e.lineage_id)?.get(key) ?? (key === 'name' ? changed.get(e.lineage_id)?.get('*') : undefined);
    if (!c) return { className: base };
    return { className: `${base} changed ${c.origin}`, title: c.reason };
  };

  async function toggleLock(e: Exercise) {
    const { error } = await supabase.from('exercises').update({ locked: !e.locked }).eq('id', e.id);
    if (error) setError(errorText(error));
    else onChanged();
  }

  const days = groupByDay(exercises);
  const dayNumbers = [...days.keys()];
  const nextDay = dayNumbers.length ? Math.max(...dayNumbers) + 1 : 1;
  if (open?.kind === 'new' && !days.has(open.day)) days.set(open.day, []);

  const done = (changedSomething: boolean) => {
    setOpen(null);
    if (changedSomething) onChanged();
  };

  const cellBtn = (e: Exercise, field: EditableField, content: string) =>
    editable ? (
      <button type="button" className="cell-btn" onClick={() => setOpen({ kind: 'row', id: e.id, mode: 'edit', field })}>
        {content ? <span className="hl">{content}</span> : <span className="empty">–</span>}
      </button>
    ) : content ? (
      <span className="hl">{content}</span>
    ) : (
      <span className="empty">–</span>
    );

  return (
    <div className="exercise-table">
      {error && <p className="msg error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th className="col-idx">
              <span className="sr-only">Numero</span>
            </th>
            <th className="col-name">Esercizio</th>
            <th className="col-num">Serie</th>
            <th className="col-num">Ripetizioni</th>
            <th className="col-num">Carico</th>
            <th className="col-num">Recupero</th>
            <th className="col-actions">
              <span className="sr-only">Azioni</span>
            </th>
          </tr>
        </thead>
        {[...days.entries()].map(([day, rows]) => (
          <tbody key={day} className="day">
            <tr className="day-row">
              <th colSpan={COLS} scope="rowgroup">
                Giorno {day}
              </th>
            </tr>
            {rows.map((e, i) => {
              const logs = logsByLineage.get(e.lineage_id) ?? [];
              const isOpen = open?.kind === 'row' && open.id === e.id ? open : null;
              return (
                <Fragment key={e.id}>
                  <tr className={`ex-row${e.locked ? ' locked' : ''}${isOpen ? ' open' : ''}`}>
                    <td className="col-idx">{i + 1}</td>
                    <td {...mark(e, 'name', 'col-name')}>
                      {cellBtn(e, 'name', e.name)}
                      {e.notes && (
                        <span {...mark(e, 'notes', 'ex-notes')}>
                          <span className="hl">{e.notes}</span>
                        </span>
                      )}
                    </td>
                    <td {...mark(e, 'sets', 'col-num')} data-label="Serie">
                      {cellBtn(e, 'sets', fmtNumber(e.sets))}
                    </td>
                    <td {...mark(e, 'reps', 'col-num')} data-label="Rip.">
                      {cellBtn(e, 'reps_min', fmtReps(e.reps_min, e.reps_max))}
                    </td>
                    <td {...mark(e, 'load_kg', 'col-num')} data-label="Carico">
                      {cellBtn(e, 'load_kg', fmtLoad(e.load_kg))}
                    </td>
                    <td {...mark(e, 'rest_seconds', 'col-num')} data-label="Recupero">
                      {cellBtn(e, 'rest_seconds', fmtRest(e.rest_seconds))}
                    </td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className={`icon-btn${isOpen?.mode === 'feedback' ? ' on' : ''}`}
                        onClick={() => setOpen(isOpen?.mode === 'feedback' ? null : { kind: 'row', id: e.id, mode: 'feedback' })}
                        aria-expanded={isOpen?.mode === 'feedback'}
                        aria-label={`Feedback per ${e.name}${logs.length ? `, ${logs.length} registrati` : ''}`}
                        title="Feedback"
                      >
                        <NoteIcon />
                        {logs.length > 0 && <span className="count">{logs.length}</span>}
                      </button>
                      {editable && (
                        <>
                          <button
                            type="button"
                            className={`icon-btn${e.locked ? ' on' : ''}`}
                            onClick={() => toggleLock(e)}
                            aria-pressed={e.locked}
                            aria-label={e.locked ? `Sblocca ${e.name}` : `Blocca ${e.name}`}
                            title={e.locked ? "Bloccato: l'AI non lo modifica" : "Blocca: l'AI non potrà modificarlo"}
                          >
                            <LockIcon open={!e.locked} />
                          </button>
                          <button
                            type="button"
                            className={`icon-btn${isOpen?.mode === 'edit' ? ' on' : ''}`}
                            onClick={() => setOpen(isOpen?.mode === 'edit' ? null : { kind: 'row', id: e.id, mode: 'edit' })}
                            aria-label={`Modifica ${e.name}`}
                            title="Modifica"
                          >
                            <PencilIcon />
                          </button>
                        </>
                      )}
                      {!editable && e.locked && (
                        <span className="locked-tag" title="Era bloccato">
                          <LockIcon />
                        </span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="panel-row">
                      <td colSpan={COLS}>
                        {isOpen.mode === 'edit' ? (
                          <ExerciseEditor exercise={e} versionId={versionId} day={day} focusField={isOpen.field} onDone={done} />
                        ) : (
                          <FeedbackPanel exercise={e} logs={logs} canLog={editable} onChanged={onChanged} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {editable && (
              <tr className="panel-row add-row">
                <td colSpan={COLS}>
                  {open?.kind === 'new' && open.day === day ? (
                    <ExerciseEditor versionId={versionId} day={day} onDone={done} />
                  ) : (
                    <button type="button" className="btn ghost" onClick={() => setOpen({ kind: 'new', day })}>
                      + Esercizio al giorno {day}
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        ))}
      </table>

      {editable && nextDay <= 7 && !(open?.kind === 'new' && open.day === nextDay) && (
        <button type="button" className="btn" onClick={() => setOpen({ kind: 'new', day: nextDay })}>
          + Aggiungi il giorno {nextDay}
        </button>
      )}
    </div>
  );
}
