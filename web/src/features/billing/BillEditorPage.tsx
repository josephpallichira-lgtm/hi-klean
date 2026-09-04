import { useEffect } from 'react';
import { invoicesApi, patientsApi } from '@shared/api/endpoints';
import { calcDraft } from '@shared/lib/money';
import { bumpData } from '@shared/lib/refresh';
import { navigate } from '@/app/router';
import { useSession } from '@/app/session';
import { useModal } from '@shared/ui/Modal';
import { useToast } from '@shared/ui/Toast';
import { Card, Field, PageHead } from '@shared/ui/primitives';
import { usePrintDocument } from '@shared/hooks/usePrintDocument';
import { ItemsTable } from './ItemsTable';
import { PatientPanel } from './PatientPanel';
import { PaymentPanel } from './PaymentPanel';
import { ProcedurePicker } from './ProcedurePicker';
import { TotalsPanel } from './TotalsPanel';
import { useBillDraft } from './useBillDraft';
import { useToothPicker } from './useToothPicker';
import type { BillDraft, Patient } from '@shared/types';

export function BillEditorPage({ editId }: { editId: number | null }) {
  const { activeDoctors, billingDoctor } = useSession();
  const { draft, loading, error, patch, patchItem, addProcedure, removeItem, reset, finish } = useBillDraft(editId);
  const modal = useModal();
  const toast = useToast();
  const pickTeeth = useToothPicker();
  const { printBill } = usePrintDocument();

  // Warn before a browser reload throws away a half-typed bill.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (draft && draft.items.length) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [draft]);

  if (loading) return <div className="empty">Loading…</div>;
  if (error) return <Card className="empty"><div className="big">⚠</div>{error}</Card>;
  if (!draft) return null;

  const totals = calcDraft(draft);

  async function pickPatient(id: number) {
    const p = await patientsApi.get(id);
    patch({
      patientId: p.id,
      linkedName: p.name,
      pat: { reg: p.reg, name: p.name, age: p.age, sex: p.sex, phone: p.phone, address: p.address },
    });
  }

  function patientFields(d: BillDraft) {
    return {
      name: (d.pat.name || '').trim(),
      reg: (d.pat.reg || '').trim(),
      age: (d.pat.age || '').trim(),
      sex: d.pat.sex || '',
      phone: (d.pat.phone || '').trim(),
      address: (d.pat.address || '').trim(),
    };
  }

  /**
   * Save the bill.
   *
   * `patientId` and `linked` are passed EXPLICITLY rather than read from
   * `draft`. The dialogs below call patch() and then commit() in the same tick,
   * and a React state update is not visible until the next render — so reading
   * draft.patientId here saw the stale value. That made "Use existing patient"
   * try to CREATE a patient carrying the existing one's ID, which the server
   * correctly rejected with 409 and the bill was silently never saved.
   */
  async function commit(
    print: boolean,
    fields: Partial<Patient>,
    who: { patientId: number | null; linked: boolean },
    type?: 'estimate',
  ) {
    try {
      let pid = who.patientId;
      if (who.linked && pid) await patientsApi.patch(pid, fields);
      else {
        const p = await patientsApi.create(fields);
        pid = p.id;
      }

      const payload: Record<string, unknown> = {
        type: type || draft!.type,
        date: draft!.date,
        patientId: pid,
        doctorId: draft!.doctorId,
        items: draft!.items.map((it) => ({ ...it, docId: it.docId || draft!.doctorId })),
        discType: draft!.discType,
        discValue: draft!.discValue,
        notes: draft!.notes || '',
        gstOn: draft!.gstOn,
      };

      let saved;
      if (draft!.isEdit && draft!.id) {
        payload.no = draft!.no;
        saved = await invoicesApi.update(draft!.id, payload);
      } else {
        payload.payments = type === 'estimate' ? [] : draft!.payments;
        payload.autoNumber = true;
        saved = await invoicesApi.create(payload);
      }

      toast((saved.type === 'estimate' ? 'Estimate ' : 'Bill ') + saved.no + ' saved');
      finish();
      bumpData();
      if (print) printBill(saved);
      navigate('invoices');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  }

  async function save(print: boolean, type?: 'estimate') {
    const d = draft!;
    const fields = patientFields(d);
    if (!fields.name) { toast('Patient name is required', true); document.getElementById('pName')?.focus(); return; }
    if (!d.items.length) { toast('Add at least one treatment', true); return; }

    // Renaming a linked patient rewrites their name on every past bill. Never
    // guess which the user meant.
    if (d.patientId && d.linkedName && fields.name.toLowerCase() !== d.linkedName.toLowerCase()) {
      modal.open({
        title: 'Which patient is this bill for?',
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              The bill is linked to <b>{d.linkedName}</b>, but the name now reads <b>{fields.name}</b>.
            </p>
            <p className="sm mut">
              Renaming changes that name on every past bill of theirs. Creating a new patient keeps the histories separate.
            </p>
          </>
        ),
        footer: (
          <>
            <button className="btn" onClick={modal.close}>Cancel</button>
            <button className="btn" id="qRen"
              onClick={() => { modal.close(); commit(print, fields, { patientId: d.patientId, linked: true }, type); }}>
              Rename {d.linkedName}
            </button>
            <button className="btn p" id="qNew" onClick={() => {
              modal.close();
              patch({ patientId: null, linkedName: null });
              commit(print, { ...fields, reg: '' }, { patientId: null, linked: false }, type);
            }}>Create new patient</button>
          </>
        ),
      });
      return;
    }

    if (!d.patientId) {
      const hits = await patientsApi.search(fields.name);
      const dup = hits.find((h) => h.name.toLowerCase() === fields.name.toLowerCase());
      if (dup && !d.dupOk) {
        modal.open({
          title: 'Patient already exists',
          body: (
            <>
              <p style={{ marginTop: 0 }}>
                <b>{dup.name}</b> ({dup.reg || ''}{dup.phone ? ' · ' + dup.phone : ''}) is already registered.
              </p>
              <p className="sm mut">Billing to the existing record keeps their history and dues in one place.</p>
            </>
          ),
          footer: (
            <>
              <button className="btn" onClick={modal.close}>Cancel</button>
              <button className="btn" id="qFresh" onClick={() => {
                modal.close();
                patch({ dupOk: true });
                commit(print, { ...fields, reg: '' }, { patientId: null, linked: false }, type);
              }}>Create a second record</button>
              <button className="btn p" id="qUse" onClick={async () => {
                modal.close();
                await pickPatient(dup.id);
                commit(print, { ...fields, reg: dup.reg }, { patientId: dup.id, linked: true }, type);
              }}>Use existing patient</button>
            </>
          ),
        });
        return;
      }
    }

    commit(print, fields, { patientId: d.patientId, linked: !!d.patientId }, type);
  }

  return (
    <>
      <PageHead
        title={editId ? 'Edit Bill ' + draft.no : 'New Bill'}
        sub={editId ? 'Payments already recorded are not touched by an edit' : 'Pick the patient, add treatments, take payment'}
        actions={
          <>
            <button className="btn" id="bClear"
              onClick={() => modal.confirm('Clear this bill and start fresh?', reset, 'Yes, clear')}>Clear</button>
            {!editId && <button className="btn" id="bEst" onClick={() => save(true, 'estimate')}>Save as Estimate</button>}
            <button className="btn" id="bSave" onClick={() => save(false)}>Save only</button>
            <button className="btn p lg" id="bSaveP" onClick={() => save(true)}>Save &amp; Print</button>
          </>
        }
      />

      <PatientPanel
        draft={draft}
        patch={patch}
        onPick={pickPatient}
        onUnlink={() => patch({ patientId: null, linkedName: null, pat: { ...draft.pat, reg: '' } })}
        header={
          <>
            <Field label="Bill No." style={{ width: 130 }}>
              <input id="bNo" value={draft.no} placeholder="Auto" readOnly={!editId}
                onChange={(e) => patch({ no: e.target.value })} />
            </Field>
            <Field label="Date" style={{ width: 155 }}>
              <input type="date" id="bDate" value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
            </Field>
            <Field style={{ minWidth: 180, flex: 1 }}
              label={<>Treating doctor <span className="mut xs">(reports only — bill prints {billingDoctor.name || ''})</span></>}>
              <select id="bDoc" value={String(draft.doctorId ?? '')} onChange={(e) => {
                const next = Number(e.target.value);
                const prev = draft.doctorId;
                patch({
                  doctorId: next,
                  items: draft.items.map((it) => (!it.docId || it.docId === prev ? { ...it, docId: next } : it)),
                });
              }}>
                {activeDoctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          </>
        }
      />

      <ProcedurePicker onPick={addProcedure} />

      <ItemsTable
        draft={draft}
        onChange={patchItem}
        onRemove={removeItem}
        onTeeth={(i) => pickTeeth(draft.items[i], (teeth, setQty) => {
          const it = draft.items[i];
          const keep = (it.desc || '').replace(/\d{2}/g, '').replace(/[,\s]+/g, ' ').trim();
          patchItem(i, {
            desc: (keep ? keep + ' ' : '') + teeth.join(', '),
            ...(setQty && teeth.length ? { qty: teeth.length } : {}),
          });
        })}
      />

      <Card className="mt">
        <TotalsPanel draft={draft} totals={totals} patch={patch} />
      </Card>

      <PaymentPanel draft={draft} totals={totals} patch={patch} />
      <div style={{ height: 24 }} />
    </>
  );
}
