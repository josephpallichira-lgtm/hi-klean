import { useEffect, useState } from 'react';
import { patientsApi } from '@shared/api/endpoints';
import { useAsync, useDebounced } from '@shared/hooks/useAsync';
import { inr } from '@shared/lib/money';
import { dmy } from '@shared/lib/date';
import { shortDoc } from '@shared/lib/text';
import { navigate } from '@/app/router';
import { useSession } from '@/app/session';
import { Card, Field, PageHead, Scroll } from '@shared/ui/primitives';
import { usePrintDocument } from '@shared/hooks/usePrintDocument';
import type { Invoice, Patient } from '@shared/types';

export function TreatmentSummaryPage({ patientId }: { patientId: number | null }) {
  const { multiDoctor, doctorOf } = useSession();
  const { printSummary } = usePrintDocument();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Patient[]>([]);
  const [showAmounts, setShowAmounts] = useState(true);
  const term = useDebounced(q, 250);

  useEffect(() => {
    let alive = true;
    if (term.trim().length < 2) { setHits([]); return; }
    patientsApi.search(term.trim()).then((h) => { if (alive) setHits(h); }).catch(() => {});
    return () => { alive = false; };
  }, [term]);

  const { data } = useAsync<[Patient, Invoice[]] | null>(
    () => (patientId ? Promise.all([patientsApi.get(patientId), patientsApi.invoices(patientId)]) : Promise.resolve(null)),
    [patientId]);

  useEffect(() => { if (data) setQ(data[0].name); }, [data]);

  const patient = data?.[0];
  const bills = (data?.[1] || []).filter((i) => i.type !== 'estimate');
  const tot = bills.reduce((a, i) => a + i.total, 0);
  const paid = bills.reduce((a, i) => a + i.paid, 0);

  return (
    <>
      <PageHead title="Treatment Summary — Invoice"
        sub="Consolidated date-wise invoice across all visits — for insurance / reimbursement / records" />

      <Card pad>
        <div className="row">
          <Field className="ac" label="Patient" style={{ flex: 1, maxWidth: 420 } as React.CSSProperties}>
            <input id="sq" placeholder="Type patient name, phone or ID…" autoComplete="off" value={q}
              onChange={(e) => { setQ(e.target.value); setOpen(true); }}
              onBlur={() => setTimeout(() => setOpen(false), 200)} />
            <div id="sac">
              {open && term.trim().length >= 2 && (
                <div className="aclist">
                  {hits.length ? hits.slice(0, 8).map((h) => (
                    <div key={h.id} data-id={h.id} onMouseDown={() => { setOpen(false); navigate('summary/' + h.id); }}>
                      <b>{h.name}</b><div className="xs mut">{h.reg || ''} {h.phone || ''}</div>
                    </div>
                  )) : <div className="mut">No match</div>}
                </div>
              )}
            </div>
          </Field>
        </div>
      </Card>

      <div id="sOut" className="mt">
        {patient && (bills.length ? (
          <Card>
            <div className="pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <b>{patient.name}</b>
                <span className="mut sm"> · {patient.reg || ''} · {patient.age || ''} Years / {patient.sex || ''}</span>
              </div>
              <div className="row">
                <label className="switch">
                  <input type="checkbox" id="sAmts" checked={showAmounts} onChange={(e) => setShowAmounts(e.target.checked)} />
                  {' '}show amounts
                </label>
                <button className="btn p" id="sPrint" onClick={() => printSummary(patient, bills, showAmounts)}>
                  🖨 Print Treatment Summary
                </button>
              </div>
            </div>
            <Scroll>
              <table>
                <thead><tr>
                  <th>Date</th><th>Description of service</th>{multiDoctor && <th>Doctor</th>}<th className="num">Amount</th>
                </tr></thead>
                <tbody>
                  {bills.map((i) => (
                    <>
                      {i.items.map((t, k) => (
                        <tr key={`${i.id}-${k}`}>
                          <td>{k === 0 ? dmy(i.date) : ''}</td>
                          <td>{t.name}{t.desc ? ' ' + t.desc : ''}{t.qty > 1 ? ` (${t.qty} UNIT)` : ''}</td>
                          {multiDoctor && <td className="sm mut">{shortDoc(doctorOf(t.docId).name)}</td>}
                          <td className="num">{inr(t.amount)}</td>
                        </tr>
                      ))}
                      {!!i.disc && (
                        <tr key={`${i.id}-d`}>
                          <td /><td className="mut">Less: discount</td>{multiDoctor && <td />}
                          <td className="num mut">− {inr(i.disc)}</td>
                        </tr>
                      )}
                      {!!i.tax && (
                        <tr key={`${i.id}-t`}>
                          <td /><td className="mut">GST</td>{multiDoctor && <td />}
                          <td className="num mut">{inr(i.tax)}</td>
                        </tr>
                      )}
                    </>
                  ))}
                  <tr style={{ background: '#fafbfc' }}>
                    <td /><td className="b right" colSpan={multiDoctor ? 2 : 1}>Total</td>
                    <td className="num b">{inr(tot)}</td>
                  </tr>
                  {tot - paid > 0.005 && (
                    <tr>
                      <td /><td className="b right" colSpan={multiDoctor ? 2 : 1}>Balance due</td>
                      <td className="num b" style={{ color: 'var(--bad)' }}>{inr(tot - paid)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Scroll>
          </Card>
        ) : <Card className="empty">No bills for this patient yet.</Card>)}
      </div>
    </>
  );
}
