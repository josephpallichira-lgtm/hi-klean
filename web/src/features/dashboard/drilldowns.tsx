/**
 * Dashboard drill-downs.
 *
 * Every number on the dashboard opens the rows behind it. A total you cannot
 * audit is a total you cannot trust.
 *
 * Collection follows the PAYMENT date and billing follows the BILL date, so
 * these are deliberately DIFFERENT lists. Money taken today against a bill
 * raised in June belongs under "Collected today" and must never appear under
 * "Billed today". Do not "fix" the discrepancy — it is the point.
 */
import { invoicesApi, reportsApi } from '@shared/api/endpoints';
import { grabFile } from '@shared/api/client';
import { useAsync } from '@shared/hooks/useAsync';
import { inr, inr0 } from '@shared/lib/money';
import { daysAgo, dmy, today } from '@shared/lib/date';
import { BalanceTag, Empty } from '@shared/ui/primitives';
import { useToast } from '@shared/ui/Toast';
import type { Invoice, PaymentRow, Report, ReportDue } from '@shared/types';

function Loading() { return <div className="empty">Loading…</div>; }
function Failed({ msg }: { msg: string }) { return <div className="empty">⚠ {msg}</div>; }

function RangeLabel({ from, to, suffix }: { from: string; to: string; suffix: string }) {
  return <div className="sm mut">{dmy(from)}{from === to ? '' : ' – ' + dmy(to)} · {suffix}</div>;
}

/* ---------------- Collected — receipts ---------------- */

export function CollectedDrill({ from, to, onOpenInvoice }: {
  from: string; to: string; onOpenInvoice: (id: number) => void;
}) {
  const toast = useToast();
  const { data, loading, error } = useAsync<[PaymentRow[], Report]>(
    () => Promise.all([reportsApi.payments(from, to), reportsApi.range(from, to)]), [from, to]);

  if (loading) return <Loading />;
  if (error) return <Failed msg={error} />;
  const [pays, rep] = data!;
  if (!pays.length) return <Empty icon="₹">No money collected in this period.</Empty>;
  const tot = pays.reduce((a, p) => a + p.amount, 0);

  return (
    <>
      <div className="mtot">
        <div>
          <RangeLabel from={from} to={to} suffix={`${pays.length} receipt${pays.length === 1 ? '' : 's'}`} />
          <div className="big">{inr(tot)}</div>
        </div>
        <div className="chips">
          {rep.modes.map((x) => <span className="chip" key={x.mode}><b>{x.mode}</b> {inr0(x.total)}</span>)}
        </div>
      </div>
      <div className="drill">
        <table>
          <thead><tr>
            <th>Bill</th><th>Patient</th><th>Mode</th>
            <th className="hide-sm">Ref</th><th className="hide-sm">Entered by</th><th className="num">Amount</th>
          </tr></thead>
          <tbody>
            {pays.map((p) => (
              <tr key={p.id} data-inv={p.invId} onClick={() => onOpenInvoice(p.invId)}>
                <td className="b">{p.no}<div className="xs mut">{dmy(p.billDate)}</div></td>
                <td>{p.pname}<div className="xs mut">{p.preg || ''}</div></td>
                <td>{p.mode}</td>
                <td className="mut sm hide-sm">{p.ref || ''}</td>
                <td className="mut sm hide-sm">{p.enteredBy || ''}</td>
                <td className="num b">{inr(p.amount)}</td>
              </tr>
            ))}
            <tr style={{ background: '#fafbfc' }}>
              <td colSpan={3} className="b right">Total collected</td>
              <td className="hide-sm" /><td className="hide-sm" />
              <td className="num b">{inr(tot)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="row mt">
        <button className="btn sm" id="dlCsv"
          onClick={() => grabFile(`/reports/daybook.csv?from=${from}&to=${to}`, toast)}>⬇ Day book CSV</button>
        <span className="xs mut" style={{ alignSelf: 'center' }}>
          Tap any row to open the bill. Payment date, not bill date — money taken today against an older bill is counted here.
        </span>
      </div>
    </>
  );
}

/* ---------------- Bills raised ---------------- */

export function BilledDrill({ from, to, onOpenInvoice }: {
  from: string; to: string; onOpenInvoice: (id: number) => void;
}) {
  const { data, loading, error } = useAsync<Invoice[]>(
    () => invoicesApi.list({ from, to }).then((l) => l.filter((i) => i.type !== 'estimate')), [from, to]);

  if (loading) return <Loading />;
  if (error) return <Failed msg={error} />;
  const list = data!;
  if (!list.length) return <Empty icon="☰">No bills raised in this period.</Empty>;
  const tot = list.reduce((a, i) => a + i.total, 0);
  const paid = list.reduce((a, i) => a + i.paid, 0);
  const names = (i: Invoice) => i.items.map((t) => t.name).join(', ');

  return (
    <>
      <div className="mtot">
        <div>
          <RangeLabel from={from} to={to} suffix={`${list.length} bill${list.length === 1 ? '' : 's'}`} />
          <div className="big">{inr(tot)}</div>
        </div>
        <div className="chips">
          <span className="chip">Collected <b>{inr0(paid)}</b></span>
          <span className="chip" style={{ color: tot - paid > 0.005 ? 'var(--bad)' : 'var(--good)' }}>
            Balance <b>{inr0(tot - paid)}</b>
          </span>
        </div>
      </div>
      <div className="drill">
        <table>
          <thead><tr>
            <th>Bill</th><th>Patient</th><th className="hide-sm">Treatments</th>
            <th className="num">Total</th><th className="num hide-sm">Paid</th><th className="num">Balance</th>
          </tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id} data-inv={i.id} onClick={() => onOpenInvoice(i.id)}>
                <td className="b">{i.no}</td>
                <td>{i.pname}<div className="xs mut">{i.preg || ''}</div></td>
                <td className="sm mut hide-sm">{names(i).slice(0, 48)}{names(i).length > 48 ? '…' : ''}</td>
                <td className="num">{inr(i.total)}</td>
                <td className="num hide-sm">{inr(i.paid)}</td>
                <td className="num"><BalanceTag bal={i.bal} /></td>
              </tr>
            ))}
            <tr style={{ background: '#fafbfc' }}>
              <td colSpan={2} className="b right">Total billed</td>
              <td className="hide-sm" />
              <td className="num b">{inr(tot)}</td>
              <td className="num b hide-sm">{inr(paid)}</td>
              <td className="num b">{inr(tot - paid)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="xs mut mt">Tap any row to open the bill. Estimates are excluded — they are not revenue.</div>
    </>
  );
}

/* ---------------- Outstanding dues ---------------- */

const waLink = (d: ReportDue) => {
  const ph = String(d.phone || '').replace(/\D/g, '');
  if (ph.length < 10) return null;
  const num = ph.length === 10 ? '91' + ph : ph;
  const msg = encodeURIComponent(
    `Dear ${d.name}, a balance of ₹${Math.round(d.bal)} is pending on bill ${d.no} at Hi-Klean Dental Clinic. Kindly settle it at your convenience. Thank you.`);
  return `https://wa.me/${num}?text=${msg}`;
};

export function DuesDrill({ onOpenInvoice }: { onOpenInvoice: (id: number) => void }) {
  const t = today();
  const { data, loading, error } = useAsync<Report>(() => reportsApi.range(t, t), [t]);

  if (loading) return <Loading />;
  if (error) return <Failed msg={error} />;
  const dues = data!.dues;
  if (!dues.length) return <Empty icon="🎉">Nothing pending. Every bill is fully paid.</Empty>;
  const over = dues.filter((d) => daysAgo(d.date) > 30).reduce((a, d) => a + d.bal, 0);

  return (
    <>
      <div className="mtot">
        <div>
          <div className="sm mut">{dues.length} bill{dues.length === 1 ? '' : 's'} pending · all time</div>
          <div className="big" style={{ color: 'var(--bad)' }}>{inr(data!.duesTotal)}</div>
        </div>
        <div className="chips">
          <span className="chip">Over 30 days <b>{inr0(over)}</b></span>
          <span className="chip">Largest <b>{inr0(Math.max(...dues.map((d) => d.bal)))}</b></span>
        </div>
      </div>
      <div className="drill">
        <table>
          <thead><tr>
            <th>Bill</th><th>Patient</th><th className="hide-sm">Phone</th>
            <th className="num">Age</th><th className="num">Balance</th><th />
          </tr></thead>
          <tbody>
            {dues.map((d) => {
              const age = daysAgo(d.date);
              const wa = waLink(d);
              return (
                <tr key={d.id} data-inv={d.id}
                  onClick={(e) => { if ((e.target as HTMLElement).closest('a')) return; onOpenInvoice(d.id); }}>
                  <td className="b">{d.no}<div className="xs mut">{dmy(d.date)}</div></td>
                  <td>{d.name}</td>
                  <td className="sm hide-sm">
                    {d.phone
                      ? <a href={'tel:' + String(d.phone).replace(/[^0-9+]/g, '')}>{d.phone}</a>
                      : <span className="mut">—</span>}
                  </td>
                  <td className={'num sm ' + (age > 30 ? 'b' : 'mut')} style={age > 30 ? { color: 'var(--bad)' } : undefined}>{age}d</td>
                  <td className="num"><span className="tag r">{inr(d.bal)}</span></td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    {wa && <a className="btn sm" href={wa} target="_blank" rel="noopener">Remind</a>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="xs mut mt">Sorted by amount. Tap a row to open the bill and collect. Highest 200 shown.</div>
    </>
  );
}
