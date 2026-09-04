/**
 * Typed calls, one per server route. Features import from here, never from
 * client.ts directly — so a route change is a one-line fix in one file.
 */
import { api } from './client';
import type {
  AuditRow, Counters, Doctor, DoctorReportRow, Invoice, Patient,
  PaymentRow, Procedure, Report, Settings, User, UserRow,
} from '../types';

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); });
  const s = p.toString();
  return s ? '?' + s : '';
};

export const auth = {
  me: () => api<{ user: User }>('/auth/me'),
  login: (username: string, password: string) => api<{ user: User }>('/auth/login', 'POST', { username, password }),
  logout: () => api('/auth/logout', 'POST'),
  changePassword: (current: string, next: string) => api('/auth/password', 'POST', { current, next }),
};

export const settingsApi = {
  get: () => api<{ settings: Settings; doctors: Doctor[]; counters: Counters }>('/settings'),
  save: (payload: { settings: Settings; doctors: Doctor[]; deleteDoctors?: number[]; counters?: Counters }) =>
    api('/settings', 'PUT', payload),
};

export const proceduresApi = {
  list: () => api<Procedure[]>('/procedures'),
  create: (body: Partial<Procedure>) => api<Procedure>('/procedures', 'POST', body),
  patch: (id: number, body: Partial<Procedure>) => api<Procedure>('/procedures/' + id, 'PATCH', body),
  bulkPrice: (body: { category: string; pct: number; roundTo: number }) =>
    api<{ count: number }>('/procedures/bulk-price', 'POST', body),
};

export const patientsApi = {
  search: (q?: string) => api<Patient[]>('/patients' + qs({ q })),
  get: (id: number) => api<Patient>('/patients/' + id),
  invoices: (id: number) => api<Invoice[]>(`/patients/${id}/invoices`),
  create: (body: Partial<Patient>) => api<Patient>('/patients', 'POST', body),
  patch: (id: number, body: Partial<Patient>) => api<Patient>('/patients/' + id, 'PATCH', body),
};

export interface InvoiceFilter { q?: string; from?: string; to?: string; status?: string; limit?: number }

export const invoicesApi = {
  list: (f: InvoiceFilter = {}) => api<Invoice[]>('/invoices' + qs(f as Record<string, string | number | undefined>)),
  get: (id: number) => api<Invoice>('/invoices/' + id),
  create: (body: unknown) => api<Invoice>('/invoices', 'POST', body),
  update: (id: number, body: unknown) => api<Invoice>('/invoices/' + id, 'PUT', body),
  addPayment: (id: number, body: { amount: number; mode: string; date: string; ref?: string }) =>
    api<Invoice>(`/invoices/${id}/payments`, 'POST', body),
  deletePayment: (id: number, payId: number | string) => api(`/invoices/${id}/payments/${payId}`, 'DELETE'),
  convert: (id: number) => api<Invoice>(`/invoices/${id}/convert`, 'POST'),
  void: (id: number, reason: string) => api(`/invoices/${id}/void`, 'POST', { reason }),
};

export const reportsApi = {
  range: (from: string, to: string) => api<Report>('/reports' + qs({ from, to })),
  payments: (from: string, to: string) => api<PaymentRow[]>('/reports/payments' + qs({ from, to })),
  doctors: (from: string, to: string) => api<DoctorReportRow[]>('/reports/doctors' + qs({ from, to })),
};

export const usersApi = {
  list: () => api<UserRow[]>('/users'),
  create: (body: { username: string; password: string; role: string; fullName?: string }) => api('/users', 'POST', body),
  patch: (id: number | string, body: Record<string, unknown>) => api('/users/' + id, 'PATCH', body),
};

export const adminApi = {
  audit: () => api<AuditRow[]>('/audit'),
  importBackup: (data: unknown) =>
    api<{ patients: number; invoices: number; skipped: number; collisions: { reg: string; existing: string; inFile: string }[]; skippedBills: string[] }>(
      '/import', 'POST', data),
};
