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
- `supabase/` migrazioni, seed, Edge Functions
- `web/` frontend
- `docs/` documentazione
