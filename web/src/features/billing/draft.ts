import { today } from '@shared/lib/date';
import type { BillDraft, Doctor, Settings } from '@shared/types';

export function blankBill(settings: Settings, activeDoctors: Doctor[]): BillDraft {
  return {
    id: null,
    type: 'bill',
    no: '',
    date: today(),
    patientId: null,
    pat: { reg: '', name: '', age: '', sex: '', phone: '', address: '' },
    doctorId: settings.defaultDoctorId || activeDoctors[0]?.id || null,
    items: [],
    discType: 'amt',
    discValue: 0,
    notes: '',
    payments: [],
    gstOn: !!settings.gstEnabled,
  };
}

/** FDI tooth numbering. Permanent above, primary ("milk") below. */
export const TEETH = {
  UP_R: [18, 17, 16, 15, 14, 13, 12, 11],
  UP_L: [21, 22, 23, 24, 25, 26, 27, 28],
  LO_R: [48, 47, 46, 45, 44, 43, 42, 41],
  LO_L: [31, 32, 33, 34, 35, 36, 37, 38],
  DUP_R: [55, 54, 53, 52, 51],
  DUP_L: [61, 62, 63, 64, 65],
  DLO_R: [85, 84, 83, 82, 81],
  DLO_L: [71, 72, 73, 74, 75],
} as const;
