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
