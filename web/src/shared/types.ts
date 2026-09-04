/** Domain types. These mirror what src/server.js actually returns — nothing here
 *  is aspirational. If the server changes shape, this file changes with it. */

export type Role = 'admin' | 'staff';
export type InvoiceType = 'bill' | 'estimate';
export type DiscType = 'amt' | 'pct';

export interface User {
  id: number;
  username: string;
  role: Role;
  fullName?: string;
  mustChange?: boolean;
}

export interface UserRow {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  active: boolean;
  last_login: string | null;
  created_at?: string;
}

export interface Doctor {
  id?: number;
  name: string;
  spec?: string;
  role_line?: string;
  reg_no?: string;
  sign_title?: string;
  active?: boolean;
  sort?: number;
}

export interface Settings {
  clinicName?: string;
  line2?: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  gstin?: string;
  logo?: string;
  regPrefix?: string;
  footer?: string;
  terms?: string;
  showTerms?: boolean;
  showWords?: boolean;
  showSign?: boolean;
  gstEnabled?: boolean;
  defaultDoctorId?: number | null;
  modes?: string[];
  lastBackup?: string;
  backupEvery?: number;
}

export interface Counters {
  bill_no?: number;
  reg_no?: number;
}

export interface Procedure {
  id: number;
  name: string;
  cat: string;
  price: number;
  perTooth: boolean;
  taxable: boolean;
  gst: number;
  gstIncl: boolean;
  active: boolean;
}

export interface Patient {
  id: number;
  reg: string;
  name: string;
  phone: string;
  age: string;
  sex: string;
  address: string;
  note?: string;
}

/** A line on a bill. `docId` is the TREATING doctor and feeds the doctor report;
 *  it never decides whose name is printed on the bill. */
export interface InvoiceItem {
  id?: number;
  pid?: number | null;
  name: string;
  desc: string;
  qty: number;
  rate: number;
  disc: number;
  amount: number;
  taxable: boolean;
  gst: number;
  gstIncl: boolean;
  perTooth: boolean;
  docId: number | null;
}

export interface Payment {
  id?: number;
  date: string;
  mode: string;
  amount: number;
  ref: string;
}

export interface Invoice {
  id: number;
  no: string;
  type: InvoiceType;
  date: string;
  patientId: number;
  doctorId: number | null;
  pname: string;
  preg: string;
  pphone?: string;
  pat?: Partial<Patient>;
  items: InvoiceItem[];
  payments: Payment[];
  sub: number;
  disc: number;
  discType: DiscType;
  discValue: number;
  tax: number;
  taxIncl?: number;
  taxAdd?: number;
  total: number;
  paid: number;
  bal: number;
  gstOn: boolean;
  notes: string;
  createdAt?: string;
  createdBy?: string;
}

export interface ReportDue {
  id: number;
  no: string;
  date: string;
  name: string;
  phone: string;
  pid: number;
  bal: number;
}

export interface Report {
  billed: { count: number; total: number; disc: number };
  collected: number;
  modes: { mode: string; total: number }[];
  doctors: { name: string; total: number }[];
  daily: { date: string; total: number }[];
  top: { name: string; n: number; total: number }[];
  dues: ReportDue[];
  duesTotal: number;
}

export interface PaymentRow {
  id: number;
  date: string;
  mode: string;
  ref: string;
  amount: number;
  at?: string;
  invId: number;
  no: string;
  billDate: string;
  billTotal: number;
  pname: string;
  preg: string;
  pphone: string;
  enteredBy: string;
}

export interface DoctorReportProcedure {
  name: string;
  qty: number;
  lines?: number;
  billed: number;
  collected: number;
  prior?: number;
}

export interface DoctorReportRow {
  doctorId: number | null;
  name: string;
  bills: number;
  patients: number;
  billed: number;
  collected: number;
  /** part of `collected` that settles bills raised BEFORE this period */
  collectedPrior: number;
  /** still owed on bills raised INSIDE this period — never negative */
  unpaid: number;
  procedures: DoctorReportProcedure[];
}

export interface AuditRow {
  id: number;
  at: string;
  username: string;
  action: string;
  entity: string;
  entity_id: string;
  detail: unknown;
}

/** The in-progress bill held by the editor before it is saved. */
export interface BillDraft {
  id: number | null;
  type: InvoiceType;
  no: string;
  date: string;
  patientId: number | null;
  pat: Partial<Patient>;
  doctorId: number | null;
  items: InvoiceItem[];
  discType: DiscType;
  discValue: number;
  notes: string;
  payments: Payment[];
  gstOn: boolean;
  isEdit?: boolean;
  linkedName?: string | null;
  dupOk?: boolean;
}
