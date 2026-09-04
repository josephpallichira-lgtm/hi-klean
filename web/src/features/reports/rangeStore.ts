import { useSyncExternalStore } from 'react';
import { fyStart, monthStart, today, weekStart } from '@shared/lib/date';

/**
 * The date range shared by Reports and the Doctor Report — and set from the
 * dashboard's "This month" tile before it navigates. A tiny external store
 * rather than context, so the dashboard can set it without either report
 * being mounted.
 */
export interface Range { from: string; to: string }

let range: Range = { from: monthStart(), to: today() };
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => range;

export function setReportRange(from: string, to: string) {
  range = { from, to };
  listeners.forEach((l) => l());
}

export const presets = {
  today: () => setReportRange(today(), today()),
  week: () => setReportRange(weekStart(), today()),
  month: () => setReportRange(monthStart(), today()),
  fy: () => setReportRange(fyStart(), today()),
};

export function useReportRange() {
  const r = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { range: r, setRange: setReportRange, presets };
}
