import type { EditableField, Exercise } from './types';

const num = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

export function fmtNumber(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : num.format(Number(n));
}

export function fmtReps(min: number | null, max: number | null): string {
  if (min == null && max == null) return '';
  if (min != null && max != null && min !== max) return `${min}–${max}`;
  return String(min ?? max);
}

export function fmtLoad(kg: number | null): string {
  return kg == null ? '' : `${fmtNumber(kg)} kg`;
}

export function fmtRest(sec: number | null): string {
  if (sec == null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}"`;
  return s === 0 ? `${m}'` : `${m}'${String(s).padStart(2, '0')}"`;
}

const dateFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
const dateFmtYear = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

export function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.getFullYear() === new Date().getFullYear() ? dateFmt.format(d) : dateFmtYear.format(d);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const FIELD_LABELS: Record<EditableField, string> = {
  name: 'Esercizio',
  sets: 'Serie',
  reps_min: 'Rip. min',
  reps_max: 'Rip. max',
  load_kg: 'Carico',
  rest_seconds: 'Recupero',
  notes: 'Note',
};

export function fieldLabel(field: string | null): string {
  if (!field) return '';
  return (FIELD_LABELS as Record<string, string>)[field] ?? field;
}

/** Display value of a raw field value stored in changes.old_value/new_value. */
export function fmtFieldValue(field: string | null, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'load_kg') return fmtLoad(Number(value));
  if (field === 'rest_seconds') return fmtRest(Number(value));
  if (typeof value === 'number') return fmtNumber(value);
  if (typeof value === 'object') {
    const v = value as Partial<Exercise>;
    return v.name ?? JSON.stringify(value);
  }
  return String(value);
}

export function groupByDay<T extends { day: number; position: number }>(rows: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const r of [...rows].sort((a, b) => a.day - b.day || a.position - b.position)) {
    if (!map.has(r.day)) map.set(r.day, []);
    map.get(r.day)!.push(r);
  }
  return map;
}

/* ---------- days of the week (exercises.day: 1 = Monday ... 7 = Sunday) ---------- */

export const WEEKDAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const WEEKDAY_LETTERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
export const DAYS = [1, 2, 3, 4, 5, 6, 7];

export function dayName(day: number): string {
  return WEEKDAYS[day - 1] ?? `Giorno ${day}`;
}

/** 1 = Monday ... 7 = Sunday */
export function weekdayOf(d: Date = new Date()): number {
  return ((d.getDay() + 6) % 7) + 1;
}

/** The next date (1 to 7 days ahead) that falls on `day`. */
export function nextDateOf(day: number, from: Date = new Date()): Date {
  const ahead = (day - weekdayOf(from) + 7) % 7 || 7;
  const d = new Date(from);
  d.setDate(d.getDate() + ahead);
  return d;
}

const longDate = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const dayMonth = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' });

export function fmtLongDate(d: Date = new Date()): string {
  return longDate.format(d);
}

export function fmtDayMonth(d: Date): string {
  return dayMonth.format(d);
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** "Ogni notte", "Ogni 3 giorni", "Ogni settimana", "Ogni 2 settimane" */
export function fmtEvery(days: number): string {
  if (days === 1) return 'Ogni notte';
  if (days === 7) return 'Ogni settimana';
  if (days % 7 === 0) return `Ogni ${days / 7} settimane`;
  return `Ogni ${days} giorni`;
}
