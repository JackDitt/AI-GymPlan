import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Mode = 'login' | 'signup' | 'magic';

const isLocal = ['127.0.0.1', 'localhost'].includes(window.location.hostname);

export default function LoginPage() {
  const { session } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) setInfo('Account creato. Controlla la tua email per confermarlo, poi accedi.');
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setInfo('Link inviato. Aprilo dalla tua email per entrare.');
      }
    } catch (err) {
      const msg = errorText(err);
      setError(msg === 'Invalid login credentials' ? 'Email o password sbagliate.' : msg);
    } finally {
      setBusy(false);
    }
  }

  const tabs: [Mode, string][] = [
    ['login', 'Accedi'],
    ['signup', 'Registrati'],
    ['magic', 'Link via email'],
  ];

  return (
    <main className="login">
      <div className="login-intro">
        <h1>AI-GymPlan</h1>
        <p>
          La tua scheda, scritta da te. Ogni settimana l'AI legge cosa hai annotato accanto agli esercizi e ritocca
          qualche casella, sempre con un motivo.
        </p>
      </div>

      <form className="login-card" onSubmit={submit}>
        <div className="tabs" role="tablist">
          {tabs.map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? 'tab active' : 'tab'}
              onClick={() => {
                setMode(m);
                setError('');
                setInfo('');
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="field">
          <span>Email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        {mode !== 'magic' && (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}

        {error && <p className="msg error">{error}</p>}
        {info && <p className="msg ok">{info}</p>}

        <button className="btn primary wide" disabled={busy}>
          {busy ? 'Attendi…' : mode === 'login' ? 'Accedi' : mode === 'signup' ? 'Crea account' : 'Inviami il link'}
        </button>

        {mode === 'magic' && isLocal && (
          <p className="hint">In locale le email arrivano su Mailpit: http://127.0.0.1:54324</p>
        )}
      </form>
    </main>
  );
}
