import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { usePlan } from '../lib/usePlan';
import type { PlanRules } from '../lib/types';
import PlanHeader from '../components/PlanHeader';

interface Draft {
  split: string;
  days_per_week: string;
  goal: string;
  max_changes_per_review: string;
  extra_rules: string;
}

export default function RulesPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { plan, current, error: planError, reload } = usePlan(planId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!planId) return;
    supabase
      .from('plan_rules')
      .select('*')
      .eq('plan_id', planId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setError(errorText(error));
        const r = data as PlanRules | null;
        setDraft({
          split: r?.split ?? '',
          days_per_week: r?.days_per_week?.toString() ?? '',
          goal: r?.goal ?? '',
          max_changes_per_review: (r?.max_changes_per_review ?? 3).toString(),
          extra_rules: r?.extra_rules ?? '',
        });
      });
  }, [planId]);

  useEffect(() => {
    if (plan) setName(plan.name);
  }, [plan]);

  if (planError) return <p className="msg error">{planError}</p>;
  if (!plan || !draft) return <p className="page-status">Caricamento…</p>;

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    setSaved(false);
    setDraft({ ...draft, [k]: e.target.value });
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || !plan) return;
    setBusy(true);
    setError('');
    const rules = {
      plan_id: plan.id,
      split: draft.split.trim() || null,
      days_per_week: draft.days_per_week ? Number(draft.days_per_week) : null,
      goal: draft.goal.trim() || null,
      max_changes_per_review: Number(draft.max_changes_per_review),
      extra_rules: draft.extra_rules.trim() || null,
    };
    const [r, p] = await Promise.all([
      supabase.from('plan_rules').upsert(rules),
      name.trim() !== plan.name ? supabase.from('plans').update({ name: name.trim() }).eq('id', plan.id) : Promise.resolve({ error: null }),
    ]);
    setBusy(false);
    const err = r.error ?? p.error;
    if (err) return setError(errorText(err));
    setSaved(true);
    reload();
  }

  async function deletePlan() {
    if (!plan) return;
    if (!window.confirm(`Eliminare "${plan.name}" con tutte le versioni e i feedback? Non si può annullare.`)) return;
    const { error } = await supabase.from('plans').delete().eq('id', plan.id);
    if (error) return setError(errorText(error));
    navigate('/');
  }

  return (
    <>
      <PlanHeader plan={plan} current={current} />
      <p className="lead">
        Le regole fisse della scheda. L'AI le riceve a ogni revisione e non può andarci contro: cambia esercizi, volume e
        carichi, ma dentro questi limiti.
      </p>

      <form className="stack-form" onSubmit={save}>
        <label className="field">
          <span>Nome della scheda</span>
          <input required maxLength={100} value={name} onChange={(e) => { setSaved(false); setName(e.target.value); }} />
        </label>
        <div className="two-col">
          <label className="field">
            <span>Split</span>
            <input maxLength={100} placeholder="Es. Push/Pull/Legs" value={draft.split} onChange={set('split')} />
          </label>
          <label className="field">
            <span>Giorni a settimana</span>
            <select value={draft.days_per_week} onChange={set('days_per_week')}>
              <option value="">Non fissato</option>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Obiettivo</span>
          <input maxLength={300} placeholder="Es. forza su squat e panca, un po' di ipertrofia" value={draft.goal} onChange={set('goal')} />
        </label>
        <label className="field">
          <span>Massimo di modifiche per revisione</span>
          <select value={draft.max_changes_per_review} onChange={set('max_changes_per_review')}>
            {Array.from({ length: 11 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? "0, l'AI non cambia nulla" : n}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Altre regole</span>
          <textarea
            rows={4}
            maxLength={2000}
            placeholder="Es. non togliere lo squat; una settimana di scarico ogni 6; niente stacchi da terra."
            value={draft.extra_rules}
            onChange={set('extra_rules')}
          />
        </label>
        <p className="hint">
          Sempre valida, per tutti: se segnali dolore su un esercizio, l'AI lo alleggerisce o lo sostituisce e, se continua,
          ti consiglia di farti vedere da un professionista.
        </p>

        {error && <p className="msg error">{error}</p>}
        <div className="form-actions">
          <button className="btn primary" disabled={busy}>
            Salva regole
          </button>
          {saved && <span className="msg ok inline">Regole salvate</span>}
        </div>
      </form>

      <section className="danger-zone">
        <h2>Elimina scheda</h2>
        <p>Cancella la scheda con tutte le versioni e i feedback.</p>
        <button type="button" className="btn danger" onClick={deletePlan}>
          Elimina scheda
        </button>
      </section>
    </>
  );
}
