import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fmtDate } from '../lib/format';
import type { UserSettings } from '../lib/types';

export default function SettingsPage() {
  const { session } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('user_settings').select('*').maybeSingle();
    if (error) setError(errorText(error));
    else setSettings(data as UserSettings);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => PromiseLike<{ error: unknown }>, ok: string) {
    setBusy(true);
    setError('');
    setInfo('');
    const { error } = await action();
    setBusy(false);
    if (error) return setError(errorText(error));
    setInfo(ok);
    load();
  }

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    await run(() => supabase.rpc('set_api_key', { p_key: key }), 'Chiave salvata.');
    setKey('');
  }

  const hasKey = !!settings?.api_key_secret_id;

  return (
    <>
      <h1>Impostazioni</h1>

      <section className="settings-block">
        <h2>Chiave API di Claude</h2>
        <p>
          La revisione settimanale usa la tua chiave, quindi il costo è sul tuo account Anthropic. Una revisione costa pochi
          centesimi. La chiave viene salvata cifrata e il sito non la mostra più: la usa solo il server durante la
          revisione.
        </p>
        <p className={`key-status ${hasKey ? 'yes' : 'no'}`}>{hasKey ? 'Chiave salvata' : 'Nessuna chiave salvata'}</p>

        <form className="inline-form" onSubmit={saveKey}>
          <label className="field grow">
            <span>{hasKey ? 'Sostituisci la chiave' : 'Incolla la chiave'}</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <button className="btn primary" disabled={busy || !key.trim()}>
            Salva chiave
          </button>
        </form>
        <p className="hint">
          La crei su console.anthropic.com, nella sezione API Keys.
        </p>
        {hasKey && (
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancellare la chiave? La revisione AI si spegne finché non ne inserisci un'altra."))
                run(() => supabase.rpc('delete_api_key'), 'Chiave cancellata.');
            }}
          >
            Cancella chiave
          </button>
        )}
      </section>

      <section className="settings-block">
        <h2>Revisione settimanale</h2>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            disabled={busy || !settings || !hasKey}
            checked={!!settings?.ai_enabled}
            onChange={(e) =>
              run(
                () => supabase.from('user_settings').update({ ai_enabled: e.target.checked }).eq('user_id', settings!.user_id),
                e.target.checked ? 'Revisione attivata.' : 'Revisione disattivata.',
              )
            }
          />
          <span>Lascia che l'AI aggiorni le mie schede una volta a settimana</span>
        </label>
        {!hasKey && <p className="hint">Per attivarla serve prima la chiave API. Senza, il sito funziona come una scheda normale.</p>}
        {settings?.last_review_at && (
          <p className="hint">
            Ultima revisione il {fmtDate(settings.last_review_at)}
            {settings.last_review_status === 'skipped' && ': saltata, nessun feedback nella settimana.'}
            {settings.last_review_status === 'error' && `: non riuscita (${settings.last_review_error ?? 'errore'}).`}
            {settings.last_review_status === 'ok' && '.'}
          </p>
        )}
      </section>

      {error && <p className="msg error">{error}</p>}
      {info && <p className="msg ok">{info}</p>}

      <section className="settings-block">
        <h2>Account</h2>
        <p>Sei entrato come {session?.user.email}.</p>
        <button type="button" className="btn" onClick={() => supabase.auth.signOut()}>
          Esci
        </button>
      </section>
    </>
  );
}
