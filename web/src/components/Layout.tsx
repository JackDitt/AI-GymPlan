import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import ThemeToggle from './ThemeToggle';

export default function Layout() {
  const { session } = useAuth();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="AI-GymPlan, le mie schede">
          AI-GymPlan
        </Link>
        <nav className="topnav">
          <NavLink to="/" end>
            Schede
          </NavLink>
          <NavLink to="/settings" title={session?.user.email ?? ''}>
            Impostazioni
          </NavLink>
          <ThemeToggle />
        </nav>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
