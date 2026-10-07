import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { fmtDate } from '../lib/format';
import type { Plan, PlanVersion } from '../lib/types';

interface PlanRow extends Plan {
  plan_versions: Pick<PlanVersion, 'version_number' | 'created_at' | 'created_by'>[];
}

export default function PlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('plans')
      .select('id, name, created_at, plan_versions(version_number, created_at, created_by)')
      .order('created_at')
      .then(({ data, error }) => {
        if (error) setError(errorText(error));
        else setPlans(data as PlanRow[]);
      });
  }, []);

  async function createPlan(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc('create_plan', { p_name: name });
    setBusy(false);
    if (error) return setError(errorText(error));
    navigate(`/plans/${data}`);
  }

  return (
    <>
      <h1>Le tue schede</h1>
      {error && <p className="msg error">{error}</p>}
      {plans === null && !error && <p className="page-status">Caricamento…</p>}

      {plans && plans.length > 0 && (
        <ul className="plan-list">
          {plans.map((p) => {
            const latest = [...p.plan_versions].sort((a, b) => b.version_number - a.version_number)[0];
            return (
              <li key={p.id}>
                <Link to={`/plans/${p.id}`} className="plan-link">
                  <span className="plan-name">{p.name}</span>
                  {latest && (
                    <span className="plan-meta">
                      Versione {latest.version_number}, {latest.created_by === 'ai' ? "aggiornata dall'AI" : 'scritta da te'}{' '}
                      il {fmtDate(latest.created_at)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {plans && plans.length === 0 && (
        <p className="lead">Non hai ancora una scheda. Dalle un nome e poi aggiungi gli esercizi giorno per giorno.</p>
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
