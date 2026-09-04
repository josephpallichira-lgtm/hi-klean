import { useEffect, useState } from 'react';
import { inr, n2 } from '@shared/lib/money';
import type { Totals } from '@shared/lib/money';
import { dmy } from '@shared/lib/date';
import { useSession } from '@/app/session';
import { useToast } from '@shared/ui/Toast';
import { BalanceTag, Card, Field } from '@shared/ui/primitives';
import type { BillDraft, Payment } from '@shared/types';

export function PaymentPanel({ draft, totals, patch }: {
  draft: BillDraft; totals: Totals; patch: (p: Partial<BillDraft>) => void;
}) {
  const { settings } = useSession();
  const toast = useToast();
  const modes = settings.modes || ['Cash'];
  const [amt, setAmt] = useState('');
  const [touched, setTouched] = useState(false);
  const [mode, setMode] = useState(modes[0]);
  const [date, setDate] = useState(draft.date);
  const [ref, setRef] = useState('');

  // Track the outstanding balance until the user types their own figure.
  useEffect(() => {
    if (!touched) setAmt(totals.bal > 0 ? String(totals.bal) : '');
  }, [totals.bal, touched]);

  useEffect(() => { setDate(draft.date); }, [draft.date]);

  const add = (payment: Payment) => {
    patch({ payments: [...draft.payments, payment] });
    setTouched(false);
    setRef('');
  };

  return (
    <Card pad className="mt">
      <div id="payBox">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b>Payment</b>
          <div data-bal>
            <span className="sm mut">Net {inr(totals.total)} · Paid {inr(totals.paid)} · </span>
            <BalanceTag bal={totals.bal} wide />
          </div>
        </div>
        <div className="hr" />

        {draft.isEdit ? (
          <div className="sm mut" style={{ marginBottom: 10 }}>
            Payments on a saved bill are added from the bill's <b>Open</b> screen so the record stays clean.{' '}
            {draft.payments.length
              ? 'Recorded: ' + draft.payments.map((p) => dmy(p.date) + ' ' + p.mode + ' ' + inr(p.amount)).join(' · ')
              : 'None recorded yet.'}
          </div>
        ) : (
          <>
            {!!draft.payments.length && (
              <table style={{ marginBottom: 10 }}><tbody>
                {draft.payments.map((p, i) => (
                  <tr key={i}>
                    <td>{dmy(p.date)}</td><td>{p.mode}</td><td className="mut">{p.ref || ''}</td>
                    <td className="num b">{inr(p.amount)}</td>
                    <td className="right">
                      <button className="btn sm d" data-pd={i}
                        onClick={() => patch({ payments: draft.payments.filter((_, k) => k !== i) })}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
            <div className="row">
              <Field label="Amount received" style={{ width: 150 }}>
                <input id="payAmt" className="num" placeholder="0" value={amt}
                  onChange={(e) => { setTouched(true); setAmt(e.target.value); }} />
              </Field>
              <Field label="Mode" style={{ width: 145 }}>
                <select id="payMode" value={mode} onChange={(e) => setMode(e.target.value)}>
                  {modes.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Date" style={{ width: 150 }}>
                <input type="date" id="payDate" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Ref / note" style={{ flex: 1, minWidth: 140 }}>
                <input id="payRef" placeholder="UPI ref, cheque no…" value={ref} onChange={(e) => setRef(e.target.value)} />
              </Field>
              <button className="btn" id="payAdd" onClick={() => {
                const a = Number(amt) || 0;
                if (a <= 0) return toast('Enter an amount', true);
                add({ date: date || draft.date, mode, amount: n2(a), ref });
              }}>Add payment</button>
              <button className="btn" id="payFull" onClick={() => {
                if (totals.bal <= 0) return toast('Nothing pending');
                add({ date: date || draft.date, mode, amount: totals.bal, ref: '' });
              }}>Mark fully paid</button>
            </div>
          </>
        )}

        <div className="row mt">
          <Field label="Note on bill (printed)" style={{ flex: 1 }}>
            <input id="bNotes" value={draft.notes || ''} placeholder="e.g. Next visit 20/08 for crown cementation"
              onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
        </div>
      </div>
    </Card>
  );
}
