import { Navigate } from 'react-router-dom';
import { useActivePlan } from '../lib/useActivePlan';
import PlanPage from './PlanPage';

/** "Settimana": the whole week of the plan the app opens on. */
export default function WeekPage() {
  const { active, error, loading } = useActivePlan();
  if (error) return <p className="msg error">{error}</p>;
  if (loading) return <p className="page-status">Caricamento…</p>;
  if (!active) return <Navigate to="/plans" replace />;
  return <PlanPage key={active.id} planId={active.id} />;
}
