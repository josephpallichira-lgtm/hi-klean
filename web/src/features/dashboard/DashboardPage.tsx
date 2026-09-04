import { invoicesApi, reportsApi } from '@shared/api/endpoints';
import { useAsync } from '@shared/hooks/useAsync';
import { inr, inr0 } from '@shared/lib/money';
import { dmy, monthStart, today } from '@shared/lib/date';
import { navigate } from '@/app/router';
import { useSession } from '@/app/session';
import { useModal } from '@shared/ui/Modal';
import { BalanceTag, Card, Empty, PageHead, Scroll, Stat } from '@shared/ui/primitives';
import { useInvoiceModal } from '@features/invoices/useInvoiceModal';
import { useReportRange } from '@features/reports/rangeStore';
import { BilledDrill, CollectedDrill, DuesDrill } from './drilldowns';
import type { Invoice, Report } from '@shared/types';

export function DashboardPage() {
  const { isAdmin } = useSession();
  const modal = useModal();
  const openInvoice = useInvoiceModal();
  const { setRange } = useReportRange();
  const t = today();
  const mStart = monthStart();

  const { data, loading, error } = useAsync<[Invoice[], Report | null, Report | null]>(
    () => Promise.all([
      invoicesApi.list({ limit: 8 }),
      isAdmin ? reportsApi.range(mStart, t) : Promise.resolve(null),
      isAdmin ? reportsApi.range(t, t) : Promise.resolve(null),
    ]), [isAdmin, t, mStart]);

  if (loading) return <div className="empty">Loading…</div>;
  if (error) return <Card className="empty"><div className="big">⚠</div>{error}</Card>;
  const [recent, month, day] = data!;

  const drill = (title: string, body: React.ReactNode) =>
    modal.open({
      title, wide: true, body,
      footer: <button className="btn" onClick={modal.close}>Close</button>,
    });

  const openAndClose = (id: number) => { modal.close(); openInvoice(id); };

  return (
    <>
      <PageHead
        title="Dashboard"
        sub={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={<button className="btn p lg" onClick={() => navigate('bill')}>＋ New Bill</button>}
      />

      {isAdmin && day && month && (
        <div className="stats">
          <Stat accent dataKey="collected" k="Collected today" v={inr0(day.collected)} n={<u>see every receipt</u>}
            onClick={() => drill('Collected — receipts', <CollectedDrill from={t} to={t} onOpenInvoice={openAndClose} />)}
          />
          <Stat dataKey="billed" k="Billed today" v={inr0(day.billed.total)}
            n={<u>{day.billed.count} bill{day.billed.count === 1 ? '' : 's'} today</u>}
            onClick={() => drill('Bills raised', <BilledDrill from={t} to={t} onOpenInvoice={openAndClose} />)}
          />
          <Stat dataKey="month" k="This month" v={inr0(month.collected)} n={<u>collection — full report</u>}
            onClick={() => { setRange(mStart, t); navigate('reports'); }}
          />
          <Stat dataKey="dues" k="Outstanding dues" v={inr0(month.duesTotal)}
            color={month.duesTotal > 0 ? 'var(--bad)' : 'var(--good)'}
            n={<u>{month.dues.length} bill{month.dues.length === 1 ? '' : 's'} pending</u>}
            onClick={() => drill('Outstanding dues', <DuesDrill onOpenInvoice={openAndClose} />)}
          />
        </div>
      )}

      <Card className="mt">
        <div className="pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6 }}>
          <b>Recent bills</b>
          <button className="btn sm" onClick={() => navigate('invoices')}>View all</button>
        </div>
        <Scroll>
          {recent.length ? (
            <table>
              <thead><tr>
                <th>Bill</th><th>Date</th><th>Patient</th>
                <th className="num">Total</th><th className="num">Balance</th><th />
              </tr></thead>
              <tbody>
                {recent.map((i) => (
                  <tr key={i.id}>
                    <td className="b">{i.no}</td>
                    <td>{dmy(i.date)}</td>
                    <td>{i.pname}<div className="xs mut">{i.preg || ''}</div></td>
                    <td className="num">{inr(i.total)}</td>
                    <td className="num"><BalanceTag bal={i.bal} /></td>
                    <td className="right"><button className="btn sm" onClick={() => openInvoice(i.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty icon="🦷">No bills yet. Click <b>New Bill</b>.</Empty>}
        </Scroll>
      </Card>
    </>
  );
}
