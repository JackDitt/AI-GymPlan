# AI-GymPlan

Scheda per la palestra che si aggiorna da sola ogni settimana:
l'AI legge il feedback che scrivi accanto a ogni esercizio e
modifica le singole caselle, con un motivo per ogni cambio.

> ⚠️ Non sostituisce un medico o un personal trainer.

## Stato
In sviluppo.

## Stack
Supabase (Postgres, Auth, Edge Functions, pg_cron) · API di Claude (ogni utente usa la propria chiave)

## Struttura
- `supabase/` migrazioni, seed, test SQL, Edge Functions
- `web/` frontend (Vite + React + TypeScript)
- `docs/` documentazione

## Avvio in locale
Servono Node.js 20+ e Docker Desktop acceso.

```bash
npm install                # Supabase CLI
npx supabase start         # database, login, Studio
cd web
npm install
cp .env.example .env.local # poi incolla la chiave "Publishable" di `npx supabase status`
npm run dev                # http://127.0.0.1:3000
```

Utente demo (solo in locale): `demo@example.com` / `demo-password`.
Le email (magic link, conferme) arrivano su Mailpit: http://127.0.0.1:54324

Test del database: `npx supabase db reset`, poi
`docker exec -i supabase_db_AI-GymPlan psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/phase2_test.sql`
