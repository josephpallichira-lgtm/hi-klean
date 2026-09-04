import { useState } from 'react';
import { invoicesApi } from '@shared/api/endpoints';
import { bumpData } from '@shared/lib/refresh';
import { inr } from '@shared/lib/money';
import { dmy, today } from '@shared/lib/date';
import { shortDoc } from '@shared/lib/text';
import { useSession } from '@/app/session';
import { useModal } from '@shared/ui/Modal';
import { useToast } from '@shared/ui/Toast';
import { BalanceTag, Field, Scroll } from '@shared/ui/primitives';
import type { Invoice } from '@shared/types';

export function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const { isAdmin, multiDoctor, doctorOf, settings } = useSession();
  const modal = useModal();
  const toast = useToast();
  const inv = invoice;
  const [amt, setAmt] = useState(String(invoice.bal));
  const [mode, setMode] = useState((settings.modes || ['Cash'])[0]);
  const [date, setDate] = useState(today());

  async function addPayment() {
    const a = Number(amt) || 0;
    if (a <= 0) return;
    try {
      await invoicesApi.addPayment(inv.id, { amount: a, mode, date });
      modal.close();
      toast('Payment added');
      bumpData();
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
  }

  function removePayment(payId: number | string) {
    modal.confirm('Remove this payment? It stays in the audit log.', async () => {
      try {
        await invoicesApi.deletePayment(inv.id, payId);
        modal.close();
        toast('Payment removed');
        bumpData();
      } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
    }, 'Remove');
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <b style={{ fontSize: 16 }}>{inv.pname}</b>
          <div className="sm mut">{inv.preg || ''} {inv.pphone ? '· ' + inv.pphone : ''}</div>
        </div>
        <div className="right">
          <div className="sm mut">{doctorOf(inv.doctorId).name}</div>
          <BalanceTag bal={inv.bal} wide />
        </div>
      </div>

      <Scroll>
        <table className="mt">
          <thead><tr>
            <th>Treatment</th>{multiDoctor && <th>Doctor</th>}<th>Description</th>
            <th className="num">Nos</th><th className="num">Rate</th><th className="num">Amount</th>
          </tr></thead>
          <tbody>
            {inv.items.map((t, i) => (
              <tr key={t.id ?? i}>
                <td>{t.name}</td>
                {multiDoctor && <td className="sm mut">{shortDoc(doctorOf(t.docId).name)}</td>}
                <td className="mut">{t.desc || ''}</td>
                <td className="num">{t.qty}</td>
                <td className="num">{inr(t.rate)}</td>
                <td className="num b">{inr(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroll>

      <div className="mt right">
        <div className="sm">Sub total: <b>{inr(inv.sub)}</b></div>
        {!!inv.disc && <div className="sm">Discount: <b>− {inr(inv.disc)}</b></div>}
        {!!inv.tax && <div className="sm">GST: <b>{inr(inv.tax)}</b></div>}
        <div style={{ fontSize: 18, color: 'var(--acc)' }}><b>Net {inr(inv.total)}</b></div>
      </div>

      <div className="hr" /><b className="sm">Payments</b>
      {inv.payments.length ? (
        <table className="mt"><tbody>
          {inv.payments.map((x, i) => (
            <tr key={x.id ?? i}>
              <td>{dmy(x.date)}</td><td>{x.mode}</td>
              <td className="mut">{x.ref || ''}</td>
              <td className="num b">{inr(x.amount)}</td>
              {isAdmin && (
                <td className="right">
                  <button className="btn sm d" data-delpay={x.id} onClick={() => removePayment(x.id!)}>✕</button>
                </td>
              )}
            </tr>
          ))}
        </tbody></table>
      ) : <div className="sm mut">No payment recorded.</div>}

      {inv.bal > 0.005 && inv.type !== 'estimate' && (
        <div className="row mt">
          <Field label="Collect now" style={{ width: 130 }}>
            <input id="cAmt" className="num" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </Field>
          <Field label="Mode" style={{ width: 140 }}>
            <select id="cMode" value={mode} onChange={(e) => setMode(e.target.value)}>
              {(settings.modes || ['Cash']).map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Date" style={{ width: 150 }}>
            <input type="date" id="cDate" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <button className="btn p" id="cAdd" onClick={addPayment}>Add payment</button>
        </div>
      )}

      {inv.notes && <div className="sm mut mt">Note: {inv.notes}</div>}
      <div className="xs mut mt">
        Created {inv.createdAt ? new Date(inv.createdAt).toLocaleString('en-IN') : ''}
        {inv.createdBy ? ' by ' + inv.createdBy : ''}
      </div>
    </>
  );
}
