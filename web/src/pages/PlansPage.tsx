import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { useActivePlan } from '../lib/useActivePlan';
import { fmtDate } from '../lib/format';

export default function PlansPage() {
  const navigate = useNavigate();
  const { plans, active, settings, error: loadError, setActive } = useActivePlan();
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function createPlan(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc('create_plan', { p_name: name });
    if (error) {
      setBusy(false);
      return setError(errorText(error));
    }
    // the first plan, or one created on purpose, is the one Oggi opens on
    await setActive(data as string);
    setBusy(false);
    navigate(`/plans/${data}`);
  }

  const shownError = error || loadError;

  return (
    <>
      <h1>Le tue schede</h1>
      {shownError && <p className="msg error">{shownError}</p>}
      {plans === null && !shownError && <p className="page-status">Caricamento…</p>}

      {plans && plans.length > 0 && (
        <ul className="plan-list">
          {plans.map((p) => {
            const isActive = p.id === active?.id;
            return (
              <li key={p.id} className={isActive ? 'active' : undefined}>
                <Link to={`/plans/${p.id}`} className="plan-link">
                  <span className="plan-name">
                    {p.name}
                    {isActive && plans.length > 1 && <span className="tag">si apre in Oggi</span>}
                  </span>
                  {p.latest && (
                    <span className="plan-meta">
                      Versione {p.latest.version_number},{' '}
                      {p.latest.created_by === 'ai' ? "aggiornata dall'AI" : 'scritta da te'} il {fmtDate(p.latest.created_at)}
                    </span>
                  )}
                </Link>
                {!isActive && settings && (
                  <button type="button" className="btn ghost plan-use" onClick={() => setActive(p.id)}>
                    Usa in Oggi
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {plans && plans.length === 0 && (
        <p className="lead">Non hai ancora una scheda. Dalle un nome e poi aggiungi gli esercizi nei giorni in cui ti alleni.</p>
      )}

      <form className="inline-form" onSubmit={createPlan}>
        <label className="field grow">
          <span>Nuova scheda</span>
          <input
            required
            maxLength={100}
            placeholder="Es. Push Pull Legs"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={busy || !name.trim()}>
          Crea scheda
        </button>
      </form>
    </>
  );
}
