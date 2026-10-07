import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './lib/auth';
import { configError } from './lib/supabase';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import PlansPage from './pages/PlansPage';
import PlanPage from './pages/PlanPage';
import VersionsPage from './pages/VersionsPage';
import ComparePage from './pages/ComparePage';
import RulesPage from './pages/RulesPage';
import SettingsPage from './pages/SettingsPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="page-status">Caricamento…</p>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  if (configError) {
    return (
      <main className="narrow">
        <h1>Configurazione mancante</h1>
        <p>{configError}</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<PlansPage />} />
        <Route path="plans/:planId" element={<PlanPage />} />
        <Route path="plans/:planId/v/:versionNumber" element={<PlanPage />} />
        <Route path="plans/:planId/versions" element={<VersionsPage />} />
        <Route path="plans/:planId/compare" element={<ComparePage />} />
        <Route path="plans/:planId/rules" element={<RulesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
