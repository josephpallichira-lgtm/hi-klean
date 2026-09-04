import { patientsApi } from '@shared/api/endpoints';
import { useAsync } from '@shared/hooks/useAsync';
import { useDataVersion } from '@shared/lib/refresh';
import { inr, inr0 } from '@shared/lib/money';
import { dmy } from '@shared/lib/date';
import { navigate } from '@/app/router';
import { BalanceTag, Card, Empty, PageHead, Scroll, Stat } from '@shared/ui/primitives';
import { useInvoiceModal } from '@features/invoices/useInvoiceModal';
import { usePatientEditor } from './usePatientEditor';
import type { Invoice, Patient } from '@shared/types';

export function PatientCardPage({ id }: { id: number }) {
  const version = useDataVersion();
  const openInvoice = useInvoiceModal();
  const edit = usePatientEditor();

  const { data, loading, error } = useAsync<[Patient, Invoice[]]>(
    () => Promise.all([patientsApi.get(id), patientsApi.invoices(id)]), [id, version]);

  if (loading) return <div className="empty">Loading…</div>;
  if (error) return <Card className="empty"><div className="big">⚠</div>{error}</Card>;
  const [p, list] = data!;
  const real = list.filter((i) => i.type !== 'estimate');
  const tot = real.reduce((a, i) => a + i.total, 0);
  const paid = real.reduce((a, i) => a + i.paid, 0);
  const net = tot - paid;

  return (
    <>
      <PageHead
        title={p.name}
        sub={<>{p.reg || ''} {p.age ? '· ' + p.age + 'y' : ''} {p.sex ? '/ ' + p.sex : ''} {p.phone ? '· 📞 ' + p.phone : ''} {p.address ? '· ' + p.address : ''}</>}
        actions={
          <>
            <button className="btn" onClick={() => navigate('patients')}>← All</button>
            <button className="btn" id="pedit" onClick={() => edit(p)}>Edit</button>
            <button className="btn" onClick={() => navigate('summary/' + p.id)}>Treatment Summary</button>
            <button className="btn p" id="nb" onClick={() => navigate('bill')}>＋ New bill</button>
          </>
        }
      />

      {p.note && <div className="warnbar"><span><b>Medical note:</b> {p.note}</span></div>}

      <div className="stats">
        <Stat k="Visits billed" v={real.length} />
        <Stat k="Total billed" v={inr0(tot)} />
        <Stat k="Received" v={inr0(paid)} />
        <Stat k={net < -0.005 ? 'Advance held' : 'Pending'} v={inr0(Math.abs(net))}
          color={net > 0.005 ? 'var(--bad)' : net < -0.005 ? 'var(--warn)' : 'var(--good)'} />
      </div>

      <Card className="mt">
        <Scroll>
          {list.length ? (
            <table>
              <thead><tr><th>Bill</th><th>Date</th><th>Treatments</th><th className="num">Total</th><th className="num">Balance</th><th /></tr></thead>
              <tbody>
                {list.slice().reverse().map((i) => (
                  <tr key={i.id}>
                    <td className="b">{i.no}</td>
                    <td>{dmy(i.date)}</td>
                    <td className="sm">
                      {i.items.map((t, k) => (
                        <div key={k}>{t.name}{t.desc ? <span className="mut"> ({t.desc})</span> : null}</div>
                      ))}
                    </td>
                    <td className="num">{inr(i.total)}</td>
                    <td className="num"><BalanceTag bal={i.bal} /></td>
                    <td className="right"><button className="btn sm" onClick={() => openInvoice(i.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No bills yet.</Empty>}
        </Scroll>
      </Card>
    </>
  );
}
