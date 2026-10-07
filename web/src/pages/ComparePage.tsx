import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { usePlan } from '../lib/usePlan';
import { fieldLabel, fmtDate, fmtFieldValue, fmtLoad, fmtNumber, fmtReps, fmtRest } from '../lib/format';
import type { Change, Exercise } from '../lib/types';
import PlanHeader from '../components/PlanHeader';

type Cell = 'name' | 'sets' | 'reps' | 'load' | 'rest' | 'notes';
const CELLS: { key: Cell; label: string; show: (e: Exercise) => string }[] = [
  { key: 'name', label: 'Esercizio', show: (e) => e.name },
  { key: 'sets', label: 'Serie', show: (e) => fmtNumber(e.sets) },
  { key: 'reps', label: 'Rip.', show: (e) => fmtReps(e.reps_min, e.reps_max) },
  { key: 'load', label: 'Carico', show: (e) => fmtLoad(e.load_kg) },
  { key: 'rest', label: 'Recupero', show: (e) => fmtRest(e.rest_seconds) },
  { key: 'notes', label: 'Note', show: (e) => e.notes ?? '' },
];

interface Row {
  lineage: string;
  day: number;
  position: number;
  a?: Exercise;
  b?: Exercise;
  diff: Set<Cell>;
  changes: Change[];
}

export default function ComparePage() {
  const { planId } = useParams();
  const [params, setParams] = useSearchParams();
  const { plan, versions, current, error: planError } = usePlan(planId);
  const [exA, setExA] = useState<Exercise[]>([]);
  const [exB, setExB] = useState<Exercise[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState('');
  // on a phone the unchanged rows are mostly noise, so start with only the changes
  const [onlyChanged, setOnlyChanged] = useState(() => window.matchMedia('(max-width: 720px)').matches);

  const bNum = Number(params.get('b') ?? current?.version_number ?? 0);
  const aNum = Number(params.get('a') ?? bNum - 1);
  const vA = versions.find((v) => v.version_number === aNum);
  const vB = versions.find((v) => v.version_number === bNum);

  useEffect(() => {
    if (!vA || !vB) return;
    // changes of every version after A up to B explain how A became B
    const between = versions.filter((v) => v.version_number > vA.version_number && v.version_number <= vB.version_number);
    Promise.all([
      supabase.from('exercises').select('*').eq('version_id', vA.id),
      supabase.from('exercises').select('*').eq('version_id', vB.id),
      between.length
        ? supabase.from('changes').select('*').in('version_id', between.map((v) => v.id)).order('created_at')
        : Promise.resolve({ data: [], error: null }),
    ]).then(([a, b, c]) => {
      const err = a.error ?? b.error ?? c.error;
      if (err) return setError(errorText(err));
      setExA(a.data as Exercise[]);
      setExB(b.data as Exercise[]);
      setChanges(c.data as Change[]);
      setError('');
    });
  }, [vA, vB, versions]);

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    const get = (lineage: string) => {
      if (!map.has(lineage)) map.set(lineage, { lineage, day: 0, position: 0, diff: new Set(), changes: [] });
      return map.get(lineage)!;
    };
    for (const e of exA) Object.assign(get(e.lineage_id), { a: e, day: e.day, position: e.position });
    for (const e of exB) Object.assign(get(e.lineage_id), { b: e, day: e.day, position: e.position });
    for (const c of changes) if (c.lineage_id && map.has(c.lineage_id)) map.get(c.lineage_id)!.changes.push(c);
    for (const r of map.values()) {
      if (!r.a || !r.b) {
        r.diff.add('name'); // added or removed: the whole exercise is the change
        continue;
      }
      for (const cell of CELLS) if (cell.show(r.a) !== cell.show(r.b)) r.diff.add(cell.key);
    }
    return [...map.values()].sort((x, y) => x.day - y.day || x.position - y.position || (x.b ? -1 : 1));
  }, [exA, exB, changes]);

  if (planError) return <p className="msg error">{planError}</p>;
  if (!plan) return <p className="page-status">Caricamento…</p>;

  const pick = (key: 'a' | 'b') => (e: { target: { value: string } }) => {
    const next = new URLSearchParams(params);
    next.set('a', String(aNum));
    next.set('b', String(bNum));
    next.set(key, e.target.value);
    setParams(next, { replace: true });
  };

  const visible = onlyChanged ? rows.filter((r) => r.diff.size > 0) : rows;
  const changedCount = rows.filter((r) => r.diff.size > 0).length;

  return (
    <>
      <PlanHeader plan={plan} current={current} />

      {versions.length < 2 ? (
        <p className="lead">
          C'è ancora una sola versione. Dopo la prima revisione settimanale qui vedrai la scheda vecchia e quella nuova una
          accanto all'altra, con le caselle cambiate evidenziate e il motivo di ogni cambio.
        </p>
      ) : (
        <>
          <div className="compare-controls">
            <label className="field">
              <span>Prima</span>
              <select value={aNum} onChange={pick('a')}>
                {versions.map((v) => (
                  <option key={v.id} value={v.version_number}>
                    v{v.version_number}, {fmtDate(v.created_at)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Dopo</span>
              <select value={bNum} onChange={pick('b')}>
                {versions.map((v) => (
                  <option key={v.id} value={v.version_number}>
                    v{v.version_number}, {fmtDate(v.created_at)}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
              <span>Solo esercizi cambiati ({changedCount})</span>
            </label>
          </div>

          {error && <p className="msg error">{error}</p>}
          {(!vA || !vB) && <p className="msg error">Scegli due versioni esistenti.</p>}

          {vA && vB && (
            <div className="compare" role="table" aria-label={`Confronto tra versione ${aNum} e versione ${bNum}`}>
              <div className="compare-head" role="row">
                <div role="columnheader" className="side-head">
                  <span className="vbig">v{aNum}</span> prima
                </div>
                <div role="columnheader" className="side-head">
                  <span className="vbig">v{bNum}</span> dopo
                </div>
                <div role="columnheader" className="side-head why-head">
                  Perché
                </div>
              </div>

              {visible.map((r, i) => {
                const prevDay = i > 0 ? visible[i - 1].day : null;
                return (
                  <div key={r.lineage} className="compare-group">
                    {r.day !== prevDay && <div className="compare-day">Giorno {r.day}</div>}
                    <div className={`compare-row${r.diff.size ? ' has-diff' : ''}`} role="row">
                      <Side ex={r.a} diff={r.diff} side="a" />
                      <Side ex={r.b} diff={r.diff} side="b" />
                      <div className="why" role="cell">
                        {r.changes.map((c) => (
                          <p key={c.id} className={`reason ${c.origin}${c.status === 'reverted' ? ' reverted' : ''}`}>
                            <span className="who">{c.origin === 'ai' ? 'AI' : 'Tu'}</span>
                            {c.action === 'update' && c.field && (
                              <span className="what">
                                {fieldLabel(c.field)}: {fmtFieldValue(c.field, c.old_value)} → {fmtFieldValue(c.field, c.new_value)}.{' '}
                              </span>
                            )}
                            {c.action === 'replace' && (
                              <span className="what">
                                Sostituito {fmtFieldValue(null, c.old_value)} con {fmtFieldValue(null, c.new_value)}.{' '}
                              </span>
                            )}
                            {c.reason}
                            {c.status === 'reverted' && (
                              <span className="reverted-note"> Annullato{c.revert_reason ? `: ${c.revert_reason}` : ''}.</span>
                            )}
                          </p>
                        ))}
                        {r.changes.length === 0 && r.diff.size > 0 && <p className="hint">Nessun motivo registrato.</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Side({ ex, diff, side }: { ex?: Exercise; diff: Set<Cell>; side: 'a' | 'b' }) {
  if (!ex) {
    return (
      <div className={`side side-${side} missing`} role="cell">
        {side === 'a' ? 'Non c’era' : 'Tolto'}
      </div>
    );
  }
  return (
    <div className={`side side-${side}`} role="cell">
      {CELLS.map((c) => {
        const v = c.show(ex);
        if (c.key === 'notes' && !v && !diff.has('notes')) return null;
        return (
          <span key={c.key} className={`sv sv-${c.key}${diff.has(c.key) ? ' diff' : ''}`}>
            {c.key !== 'name' && <span className="sl">{c.label}</span>}
            <span className="svv">{v || '–'}</span>
          </span>
        );
      })}
    </div>
  );
}
