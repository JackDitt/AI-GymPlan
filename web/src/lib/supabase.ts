import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const configError =
  !url || !key
    ? 'Mancano VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Copia web/.env.example in web/.env.local e inserisci i valori di `npx supabase status`.'
    : null;

// The publishable (anon) key is safe in the browser: Row Level Security
// decides what each signed-in user can read and write.
export const supabase = createClient(url ?? 'http://invalid.local', key ?? 'missing');

/** Turns a Supabase/PostgREST error into a sentence for the UI. */
export function errorText(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; details?: string };
  const msg = e.message ?? 'Errore sconosciuto';
  if (msg.includes('violates check constraint')) return 'Valore fuori dai limiti consentiti.';
  if (msg.includes('Failed to fetch')) return 'Supabase non risponde. È acceso? (npx supabase start)';
  return msg;
}
