import { reportsApi } from '@shared/api/endpoints';
import { useAsync } from '@shared/hooks/useAsync';
import { useDataVersion } from '@shared/lib/refresh';
import { inr, inr0 } from '@shared/lib/money';
import { dmy } from '@shared/lib/date';
import { navigate } from '@/app/router';
import { Card, PageHead, Scroll, Stat } from '@shared/ui/primitives';
import { useInvoiceModal } from '@features/invoices/useInvoiceModal';
import { RangeBar } from './RangeBar';
import { useReportRange } from './rangeStore';

export function ReportsPage() {
  const { range } = useReportRange();
  const version = useDataVersion();
  const openInvoice = useInvoiceModal();
  const { data, loading, error } = useAsync(
    () => reportsApi.range(range.from, range.to), [range.from, range.to, version]);

  return (
    <>
      <PageHead title="Reports" sub="Collection, dues and treatment mix" />
      <RangeBar idPrefix="r" csvPath={(f, t) => `/reports/daybook.csv?from=${f}&to=${t}`} />

      <div id="rout" className="mt">
        {loading ? <div className="empty">Loading…</div>
          : error ? <div className="empty">⚠ {error}</div>
          : data ? (() => {
            const d = data;
            const mx = Math.max(1, ...d.modes.map((m) => m.total));
            return (
              <>
                <div className="stats">
                  <Stat accent k="Collected" v={inr0(d.collected)} n="in selected period" />
                  <Stat k="Billed" v={inr0(d.billed.total)} n={`${d.billed.count} bills`} />
                  <Stat k="Discount given" v={inr0(d.billed.disc)} />
                  <Stat k="Outstanding (all time)" v={inr0(d.duesTotal)}
                    color={d.duesTotal > 0 ? 'var(--bad)' : 'var(--good)'} />
                </div>

                <div className="grid mt" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(310px,1fr))' }}>
                  <Card>
                    <div className="pad" style={{ paddingBottom: 4 }}><b>Payment mode split</b></div>
                    <div className="pad" style={{ paddingTop: 6 }}>
                      {d.modes.length ? d.modes.map((m) => (
                        <div key={m.mode} style={{ marginBottom: 9 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                            <b>{m.mode}</b>
                            <span>{inr0(m.total)} <span className="mut xs">{d.collected ? Math.round((m.total / d.collected) * 100) : 0}%</span></span>
                          </div>
                          <div style={{ height: 7, background: '#eef2f5', borderRadius: 5, marginTop: 3 }}>
                            <div style={{ height: '100%', width: ((m.total / mx) * 100).toFixed(1) + '%', background: 'var(--acc)', borderRadius: 5 }} />
                          </div>
                        </div>
                      )) : <div className="mut sm">No collection in this period.</div>}
                    </div>
                  </Card>

                  <Card>
                    <div className="pad" style={{ paddingBottom: 4 }}><b>Doctor-wise collection</b></div>
                    <Scroll>
                      {d.doctors.length ? (
                        <table><tbody>
                          {d.doctors.map((x) => (
                            <tr key={x.name}><td>{x.name}</td><td className="num b">{inr0(x.total)}</td></tr>
                          ))}
                        </tbody></table>
                      ) : <div className="pad mut sm">—</div>}
                      <div className="pad">
                        <button className="btn sm" onClick={() => navigate('doctors')}>Full doctor report →</button>
                      </div>
                    </Scroll>
                  </Card>
                </div>

                <div className="grid mt" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))' }}>
                  <Card>
                    <div className="pad" style={{ paddingBottom: 4 }}><b>Top treatments</b></div>
                    <Scroll>
                      {d.top.length ? (
                        <table>
                          <thead><tr><th>Treatment</th><th className="num">Count</th><th className="num">Revenue</th></tr></thead>
                          <tbody>{d.top.map((t) => (
                            <tr key={t.name}><td>{t.name}</td><td className="num">{t.n}</td><td className="num b">{inr0(t.total)}</td></tr>
                          ))}</tbody>
                        </table>
                      ) : <div className="pad mut sm">—</div>}
                    </Scroll>
                  </Card>

                  <Card>
                    <div className="pad" style={{ paddingBottom: 4 }}><b>Day-wise collection</b></div>
                    <Scroll style={{ maxHeight: 400 }}>
                      {d.daily.length ? (
                        <table>
                          <thead><tr><th>Date</th><th className="num">Collected</th></tr></thead>
                          <tbody>{d.daily.map((x) => (
                            <tr key={x.date}><td>{dmy(x.date)}</td><td className="num b">{inr0(x.total)}</td></tr>
                          ))}</tbody>
                        </table>
                      ) : <div className="pad mut sm">—</div>}
                    </Scroll>
                  </Card>
                </div>

                <Card className="mt">
                  <div className="pad" style={{ paddingBottom: 4 }}>
                    <b>Pending dues</b> <span className="mut sm">all time</span>
                  </div>
                  <Scroll style={{ maxHeight: 420 }}>
                    {d.dues.length ? (
                      <table>
                        <thead><tr><th>Bill</th><th>Date</th><th>Patient</th><th>Phone</th><th className="num">Balance</th><th /></tr></thead>
                        <tbody>{d.dues.map((x) => (
                          <tr key={x.id}>
                            <td className="b">{x.no}</td><td>{dmy(x.date)}</td><td>{x.name}</td><td>{x.phone || ''}</td>
                            <td className="num"><span className="tag r">{inr(x.bal)}</span></td>
                            <td className="right"><button className="btn sm" onClick={() => openInvoice(x.id)}>Collect</button></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    ) : <div className="empty sm">No pending dues 🎉</div>}
                  </Scroll>
                </Card>
              </>
            );
          })() : null}
      </div>
    </>
  );
}
