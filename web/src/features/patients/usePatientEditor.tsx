import { useCallback } from 'react';
import { patientsApi } from '@shared/api/endpoints';
import { bumpData } from '@shared/lib/refresh';
import { useModal } from '@shared/ui/Modal';
import { useToast } from '@shared/ui/Toast';
import { Field } from '@shared/ui/primitives';
import type { Patient } from '@shared/types';

export function usePatientEditor() {
  const modal = useModal();
  const toast = useToast();

  return useCallback((existing: Patient | null) => {
    const isNew = !existing;
    const p = existing || ({} as Partial<Patient>);
    const state = {
      reg: p.reg || '', name: p.name || '', age: p.age || '',
      sex: p.sex || '', phone: p.phone || '', address: p.address || '', note: p.note || '',
    };

    modal.open({
      title: isNew ? 'New patient' : 'Edit patient',
      body: (
        <>
          <div className="row">
            <Field label="Patient ID" style={{ width: 130 }}>
              <input id="ep_reg" defaultValue={state.reg} placeholder="Auto" onChange={(e) => { state.reg = e.target.value; }} />
            </Field>
            <Field label="Name *" style={{ flex: 1, minWidth: 170 }}>
              <input id="ep_name" defaultValue={state.name} onChange={(e) => { state.name = e.target.value; }} />
            </Field>
          </div>
          <div className="row mt">
            <Field label="Age" style={{ width: 90 }}>
              <input id="ep_age" defaultValue={state.age} onChange={(e) => { state.age = e.target.value; }} />
            </Field>
            <Field label="Sex" style={{ width: 120 }}>
              <select id="ep_sex" defaultValue={state.sex} onChange={(e) => { state.sex = e.target.value; }}>
                <option value="">-</option>
                {['Male', 'Female', 'Other'].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Phone" style={{ width: 160 }}>
              <input id="ep_phone" defaultValue={state.phone} onChange={(e) => { state.phone = e.target.value; }} />
            </Field>
          </div>
          <div className="row mt">
            <Field label="Address" style={{ flex: 1 }}>
              <input id="ep_addr" defaultValue={state.address} onChange={(e) => { state.address = e.target.value; }} />
            </Field>
          </div>
          <div className="row mt">
            <Field label="Medical alerts (diabetes, BP, allergy…)" style={{ flex: 1 }}>
              <textarea id="ep_note" defaultValue={state.note} onChange={(e) => { state.note = e.target.value; }} />
            </Field>
          </div>
        </>
      ),
      footer: (
        <>
          <button className="btn" onClick={modal.close}>Cancel</button>
          <button className="btn p" id="ep_save" onClick={async () => {
            const body = {
              name: state.name.trim(), reg: state.reg.trim(), age: state.age.trim(),
              sex: state.sex, phone: state.phone.trim(), address: state.address.trim(), note: state.note,
            };
            if (!body.name) return toast('Name required', true);
            try {
              if (isNew) await patientsApi.create(body);
              else await patientsApi.patch(existing!.id, body);
              modal.close();
              toast('Patient saved');
              bumpData();
            } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
          }}>Save</button>
        </>
      ),
    });
  }, [modal, toast]);
}
