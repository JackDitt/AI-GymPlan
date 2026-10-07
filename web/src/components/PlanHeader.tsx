import { NavLink } from 'react-router-dom';
import type { Plan, PlanVersion } from '../lib/types';

export default function PlanHeader({ plan, current }: { plan: Plan; current: PlanVersion | null }) {
  const base = `/plans/${plan.id}`;
  return (
    <div className="plan-header">
      <h1>
        {plan.name}
        {current && <span className="vbadge" title={`Versione ${current.version_number}`}>{String(current.version_number).padStart(2, '0')}</span>}
      </h1>
      <nav className="subnav" aria-label="Sezioni della scheda">
        <NavLink to={base} end>
          Scheda
        </NavLink>
        <NavLink to={`${base}/versions`}>Versioni</NavLink>
        <NavLink to={`${base}/compare`}>Confronta</NavLink>
        <NavLink to={`${base}/rules`}>Regole</NavLink>
      </nav>
    </div>
  );
}
