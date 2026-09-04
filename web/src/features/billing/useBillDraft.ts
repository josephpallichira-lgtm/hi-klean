import { useCallback, useEffect, useState } from 'react';
import { invoicesApi, patientsApi } from '@shared/api/endpoints';
import { calcDraft } from '@shared/lib/money';
import { useSession } from '@/app/session';
import { blankBill } from './draft';
import type { BillDraft, InvoiceItem, Procedure } from '@shared/types';

/**
 * The bill being edited.
 *
 * Held in a module-level slot as well as React state so that navigating away
 * from #bill and back does NOT silently discard a half-typed bill — the old app
 * kept the draft in a module variable `B` for exactly that reason, and the front
 * desk relies on it.
 */
let held: BillDraft | null = null;
export const clearHeldDraft = () => { held = null; };
export const heldDraft = () => held;
export const hasUnsavedWork = () => !!held && !!held.items.length;

export function useBillDraft(editId: number | null) {
  const { settings, activeDoctors } = useSession();
  const [draft, setDraft] = useState<BillDraft | null>(() =>
    held && !held.isEdit && !editId ? held : null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setError(null);
      if (editId) {
        if (held && held.id === editId) { setDraft(held); setLoading(false); return; }
        try {
          const inv = await invoicesApi.get(editId);
          const p = await patientsApi.get(inv.patientId);
          if (!alive) return;
          const d: BillDraft = {
            id: inv.id, type: inv.type, no: inv.no, date: inv.date,
            patientId: inv.patientId,
            pat: { reg: p.reg, name: p.name, age: p.age, sex: p.sex, phone: p.phone, address: p.address },
            doctorId: inv.doctorId,
            items: inv.items.map((i) => ({ ...i })),
            discType: inv.discType, discValue: inv.discValue,
            notes: inv.notes, payments: inv.payments, gstOn: inv.gstOn,
            isEdit: true, linkedName: p.name,
          };
          held = d;
          setDraft(d);
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : String(e));
        } finally { if (alive) setLoading(false); }
        return;
      }
      if (!held || held.isEdit) held = blankBill(settings, activeDoctors);
      setDraft(held);
      setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const patch = useCallback((p: Partial<BillDraft>) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...p };
      calcDraft(next);          // keep line .amount current for the table
      held = next;
      return next;
    });
  }, []);

  const patchItem = useCallback((index: number, p: Partial<InvoiceItem>) => {
    setDraft((d) => {
      if (!d) return d;
      const items = d.items.map((it, i) => (i === index ? { ...it, ...p } : it));
      const next = { ...d, items };
      calcDraft(next);
      held = next;
      return next;
    });
  }, []);

  const addProcedure = useCallback((p: Procedure) => {
    setDraft((d) => {
      if (!d) return d;
      const item: InvoiceItem = {
        pid: p.id, name: p.name, desc: '', qty: 1, rate: p.price, disc: 0, amount: p.price,
        taxable: !!p.taxable, gst: p.gst, gstIncl: p.gstIncl !== false,
        perTooth: p.perTooth, docId: d.doctorId,
      };
      const next = { ...d, items: [...d.items, item] };
      calcDraft(next);
      held = next;
      return next;
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, items: d.items.filter((_, i) => i !== index) };
      calcDraft(next);
      held = next;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    held = blankBill(settings, activeDoctors);
    setDraft(held);
  }, [settings, activeDoctors]);

  const finish = useCallback(() => { held = null; }, []);

  return { draft, loading, error, patch, patchItem, addProcedure, removeItem, reset, finish };
}
