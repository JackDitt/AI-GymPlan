import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePlan } from '../lib/usePlan';
import { fmtDate } from '../lib/format';
import PlanHeader from '../components/PlanHeader';

export default function VersionsPage() {
  const { planId } = useParams();
  const { plan, versions, current, error } = usePlan(planId);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!versions.length) return;
    supabase
      .from('changes')
      .select('version_id')
      .in(
        'version_id',
        versions.map((v) => v.id),
      )
      .then(({ data }) => {
        const m = new Map<string, number>();
        for (const r of data ?? []) m.set(r.version_id, (m.get(r.version_id) ?? 0) + 1);
        setCounts(m);
      });
  }, [versions]);

  if (error) return <p className="msg error">{error}</p>;
  if (!plan) return <p className="page-status">Caricamento…</p>;

  const newestFirst = [...versions].reverse();

  return (
    <>
      <PlanHeader plan={plan} current={current} />
      <p className="lead">
        Ogni revisione settimanale crea una versione nuova. Le precedenti restano qui, così puoi vedere come è cambiata la
        scheda.
      </p>
      <ol className="version-list" reversed>
        {newestFirst.map((v) => {
          const isCurrent = v.id === current?.id;
          const n = counts.get(v.id) ?? 0;
          return (
            <li key={v.id} className={isCurrent ? 'current' : undefined}>
              <span className="vnum">v{v.version_number}</span>
              <div className="vbody">
                <p className="vtitle">
                  <Link to={isCurrent ? `/plans/${plan.id}` : `/plans/${plan.id}/v/${v.version_number}`}>
                    {v.created_by === 'ai' ? "Revisione dell'AI" : 'Scritta da te'}, {fmtDate(v.created_at)}
                  </Link>
                  {isCurrent && <span className="tag">attuale</span>}
                </p>
                {v.summary && <p className="vsummary">{v.summary}</p>}
                <p className="vmeta">
                  {v.version_number > 1 && (
                    <Link to={`/plans/${plan.id}/compare?a=${v.version_number - 1}&b=${v.version_number}`}>
                      Confronta con la v{v.version_number - 1}
                    </Link>
                  )}
                  {n > 0 && <span>{n === 1 ? '1 modifica registrata' : `${n} modifiche registrate`}</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
