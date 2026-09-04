import { useState } from 'react';
import { invoicesApi } from '@shared/api/endpoints';
import { useAsync, useDebounced } from '@shared/hooks/useAsync';
import { useDataVersion } from '@shared/lib/refresh';
import { inr } from '@shared/lib/money';
import { dmy } from '@shared/lib/date';
import { navigate } from '@/app/router';
import { BalanceTag, Card, Empty, Field, PageHead } from '@shared/ui/primitives';
import { usePrintDocument } from '@shared/hooks/usePrintDocument';
import { useInvoiceModal } from './useInvoiceModal';

const BLANK = { q: '', from: '', to: '', st: 'all' };

export function InvoiceListPage() {
  const [f, setF] = useState(BLANK);
  const q = useDebounced(f.q, 300);
  const version = useDataVersion();
  const openInvoice = useInvoiceModal();
  const { printBill } = usePrintDocument();

  const { data, loading, error } = useAsync(
    () => invoicesApi.list({ q, from: f.from, to: f.to, status: f.st === 'all' ? undefined : f.st }),
    [q, f.from, f.to, f.st, version]);

  const list = data || [];
  const real = list.filter((i) => i.type !== 'estimate');
  const tot = real.reduce((a, i) => a + i.total, 0);
  const paid = real.reduce((a, i) => a + i.paid, 0);
  const names = (n: string[]) => n.join(', ');

  return (
    <>
      <PageHead title="Bills" sub="Search by bill number, patient, phone or ID"
        actions={<button className="btn p" onClick={() => navigate('bill')}>＋ New Bill</button>} />

      <Card pad>
        <div className="row">
          <Field label="Search" style={{ flex: 2, minWidth: 190 }}>
            <input id="iq" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </Field>
          <Field label="From"><input type="date" id="ifrom" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" id="ito" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          <Field label="Status">
            <select id="ist" value={f.st} onChange={(e) => setF({ ...f, st: e.target.value })}>
              {['all', 'pending', 'paid'].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
            </select>
          </Field>
          <button className="btn" id="iclr" onClick={() => setF(BLANK)}>Reset</button>
        </div>
      </Card>

      <Card className="mt">
        <div className="scroll" id="ilist">
          {loading ? <div className="empty">Loading…</div>
            : error ? <div className="empty">⚠ {error}</div>
            : list.length ? (
              <table>
                <thead><tr>
                  <th>Bill</th><th>Date</th><th>Patient</th><th>Treatments</th>
                  <th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th><th />
                </tr></thead>
                <tbody>
                  {list.map((i) => {
                    const n = names(i.items.map((t) => t.name));
                    return (
                      <tr key={i.id}>
                        <td className="b">{i.no}{i.type === 'estimate' && <span className="tag y"> EST</span>}</td>
                        <td>{dmy(i.date)}</td>
                        <td>{i.pname}<div className="xs mut">{i.preg || ''}{i.pphone ? ' · ' + i.pphone : ''}</div></td>
                        <td className="sm mut">{n.slice(0, 55)}{n.length > 55 ? '…' : ''}</td>
                        <td className="num">{inr(i.total)}</td>
                        <td className="num">{inr(i.paid)}</td>
                        <td className="num"><BalanceTag bal={i.bal} /></td>
                        <td className="right" style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn sm" onClick={() => openInvoice(i.id)}>Open</button>{' '}
                          <button className="btn sm" onClick={async () => printBill(await invoicesApi.get(i.id))}>🖨</button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: '#fafbfc' }}>
                    <td colSpan={4} className="b right">
                      {real.length} bills{list.length - real.length ? ` + ${list.length - real.length} estimates (not counted)` : ''}
                    </td>
                    <td className="num b">{inr(tot)}</td>
                    <td className="num b">{inr(paid)}</td>
                    <td className="num b">{inr(tot - paid)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            ) : <Empty icon="☰">No bills match.</Empty>}
        </div>
      </Card>
    </>
  );
}
