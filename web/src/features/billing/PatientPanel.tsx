import { useEffect, useState } from 'react';
import { patientsApi } from '@shared/api/endpoints';
import { useDebounced } from '@shared/hooks/useAsync';
import { inr } from '@shared/lib/money';
import { navigate } from '@/app/router';
import { Card, Field } from '@shared/ui/primitives';
import type { BillDraft, Patient } from '@shared/types';

export function PatientPanel({ draft, patch, onPick, onUnlink, header }: {
  draft: BillDraft;
  patch: (p: Partial<BillDraft>) => void;
  onPick: (id: number) => void;
  onUnlink: () => void;
  header: React.ReactNode;
}) {
  const [search, setSearch] = useState(draft.pat.name || '');
  const [hits, setHits] = useState<Patient[]>([]);
  const [open, setOpen] = useState(false);
  const [dues, setDues] = useState<{ count: number; due: number } | null>(null);
  const q = useDebounced(search, 250);

  useEffect(() => {
    let alive = true;
    if (q.trim().length < 2) { setHits([]); return; }
    patientsApi.search(q.trim()).then((h) => { if (alive) setHits(h); }).catch(() => {});
    return () => { alive = false; };
  }, [q]);

  useEffect(() => {
    let alive = true;
    if (!draft.patientId) { setDues(null); return; }
    patientsApi.invoices(draft.patientId).then((list) => {
      if (!alive) return;
      const bills = list.filter((i) => i.type !== 'estimate' && i.id !== draft.id);
      setDues({ count: bills.length, due: bills.reduce((a, i) => a + Math.max(0, i.bal), 0) });
    }).catch(() => {});
    return () => { alive = false; };
  }, [draft.patientId, draft.id]);

  const setPat = (k: string, v: string) => patch({ pat: { ...draft.pat, [k]: v } });
  const renameWarning = draft.patientId && draft.linkedName
    && (draft.pat.name || '').trim()
    && (draft.pat.name || '').trim().toLowerCase() !== draft.linkedName.toLowerCase();

  return (
    <Card pad>
      <div className="row" style={{ gap: 12 }}>
        <Field className="ac" style={{ flex: 2, minWidth: 220 } as React.CSSProperties}
          label="Patient — type name, phone or ID to search">
          <input id="pSearch" placeholder="Start typing…" autoComplete="off" value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onBlur={() => setTimeout(() => setOpen(false), 200)} />
          <div id="pAc">
            {open && search.trim().length >= 2 && (
              <div className="aclist">
                {hits.length ? hits.slice(0, 8).map((h) => (
                  <div key={h.id} data-id={h.id} onMouseDown={() => { setOpen(false); onPick(h.id); }}>
                    <b>{h.name}</b>
                    <div className="xs mut">{h.reg || ''} {h.phone ? '· ' + h.phone : ''} {h.age ? '· ' + h.age + 'y' : ''}</div>
                  </div>
                )) : <div className="mut">No match — fill the fields below to register a new patient</div>}
              </div>
            )}
          </div>
        </Field>
        {header}
      </div>

      <div className="row mt" style={{ gap: 12 }}>
        <Field label="Patient ID" style={{ width: 120 }}>
          <input id="pReg" value={draft.pat.reg || ''} placeholder="Auto" onChange={(e) => setPat('reg', e.target.value)} />
        </Field>
        <Field label="Name *" style={{ flex: 2, minWidth: 190 }}>
          <input id="pName" value={draft.pat.name || ''} onChange={(e) => setPat('name', e.target.value)} />
        </Field>
        <Field label="Age" style={{ width: 80 }}>
          <input id="pAge" value={draft.pat.age || ''} onChange={(e) => setPat('age', e.target.value)} />
        </Field>
        <Field label="Sex" style={{ width: 110 }}>
          <select id="pSex" value={draft.pat.sex || ''} onChange={(e) => setPat('sex', e.target.value)}>
            <option value="">-</option>
            {['Male', 'Female', 'Other'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Phone" style={{ width: 150 }}>
          <input id="pPhone" value={draft.pat.phone || ''} onChange={(e) => setPat('phone', e.target.value)} />
        </Field>
        <Field label="Address" style={{ flex: 2, minWidth: 180 }}>
          <input id="pAddr" value={draft.pat.address || ''} onChange={(e) => setPat('address', e.target.value)} />
        </Field>
      </div>

      <div id="pWarn">
        {renameWarning && (
          <div className="warnbar" style={{ margin: '10px 0 0' }}>
            <span>
              This bill is linked to <b>{draft.linkedName}</b> but the name now reads <b>{draft.pat.name}</b>.
              On save you will be asked whether to rename that patient or create a new one.
            </span>
            <button className="btn sm" id="pUn" onClick={onUnlink}>Make it a new patient</button>
          </div>
        )}
      </div>

      <div id="pDues" className="mt">
        {dues && (
          <div className="sm mut">
            Existing patient · {dues.count} previous bill{dues.count === 1 ? '' : 's'}{' '}
            {dues.due > 0.005
              ? <>· <span className="tag r">Pending {inr(dues.due)}</span></>
              : <>· <span className="tag g">No dues</span></>}
            {' '}· <a href={'#patients/' + draft.patientId}
              onClick={(e) => { e.preventDefault(); navigate('patients/' + draft.patientId); }}>view history</a>
          </div>
        )}
      </div>
    </Card>
  );
}
