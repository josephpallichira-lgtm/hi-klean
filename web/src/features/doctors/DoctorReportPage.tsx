import { useState } from 'react';
import { reportsApi } from '@shared/api/endpoints';
import { useAsync } from '@shared/hooks/useAsync';
import { useDataVersion } from '@shared/lib/refresh';
import { inr, inr0 } from '@shared/lib/money';
import { Card, PageHead, Scroll, Stat } from '@shared/ui/primitives';
import { RangeBar } from '@features/reports/RangeBar';
import { useReportRange } from '@features/reports/rangeStore';

/**
 * Doctor report.
 *
 * NEVER show `billed - collected` as "outstanding". Billing is counted on the
 * BILL date and collection on the PAYMENT date, so they cover different sets of
 * bills; settle an old balance inside the window and that subtraction goes
 * negative, which reads as though the doctor was paid for treatment nobody
 * billed. The server returns `collectedPrior` and `unpaid` instead — use those.
 */
export function DoctorReportPage() {
  const { range } = useReportRange();
  const version = useDataVersion();
  const [picked, setPicked] = useState<number | null>(null);

  const { data, loading, error } = useAsync(
    () => reportsApi.doctors(range.from, range.to), [range.from, range.to, version]);

  const list = data || [];
  const grand = list.reduce((a, d) => a + d.billed, 0);
  const anyPrior = list.some((d) => (d.collectedPrior || 0) > 0.004);
  // A doctor picked in an earlier date range may have nothing in this one.
  const active = picked !== null && list.some((d) => d.doctorId === picked) ? picked : null;
  const shown = active === null ? list : list.filter((d) => d.doctorId === active);

  return (
    <>
      <PageHead title="Doctor Report"
        sub="What each doctor did, and what it billed and collected. Collection is split across the treatments on each bill in proportion to their value." />
      <RangeBar idPrefix="d" csvPath={(f, t) => `/reports/doctors.csv?from=${f}&to=${t}`} />

      <div id="dout" className="mt">
        {loading ? <div className="empty">Loading…</div>
          : error ? <div className="empty">⚠ {error}</div>
          : !list.length ? <Card className="empty">No treatments billed in this period.</Card>
          : (
            <>
              <div className="stats">
                {list.map((d) => (
                  <Stat key={String(d.doctorId)}
                    dataId={d.doctorId ?? undefined}
                    active={active === d.doctorId}
                    k={d.name}
                    v={inr0(d.billed)}
                    n={
                      <>
                        {d.bills} bill{d.bills === 1 ? '' : 's'} · {d.patients} patient{d.patients === 1 ? '' : 's'} · collected {inr0(d.collected)}
                        <div className="n">
                          <u>{active === d.doctorId ? 'showing only this doctor' : "see this doctor's procedures"}</u>
                        </div>
                        <div className="n">{grand ? Math.round((d.billed / grand) * 100) : 0}% of period revenue</div>
                      </>
                    }
                    onClick={() => setPicked(active === d.doctorId ? null : (d.doctorId ?? null))}
                  />
                ))}
              </div>

              {active !== null && (
                <div className="row mt">
                  <button className="btn" data-do="docall" onClick={() => setPicked(null)}>← All doctors</button>
                  <span className="sm mut" style={{ alignSelf: 'center' }}>Showing <b>{shown[0].name}</b> only.</span>
                </div>
              )}

              {anyPrior && (
                <Card pad className="mt sm" style={{ borderLeft: '3px solid var(--acc)' }}>
                  <b>Why collected can exceed billed.</b> Billing is counted on the <b>bill date</b>; collection is counted
                  on the <b>payment date</b>. A balance settled in this period against a bill raised earlier shows up as
                  collection here with no matching billing — that is older work being paid for, not unbilled treatment.
                  The amount is stated per doctor below.
                </Card>
              )}

              {shown.map((d) => (
                <Card key={String(d.doctorId)} className="mt doccard">
                  <div className="pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <b>{d.name}</b>
                    <span className="sm mut">
                      Billed <b>{inr(d.billed)}</b> · Collected <b>{inr(d.collected)}</b>
                      {(d.collectedPrior || 0) > 0.004 && (
                        <> <span className="tag y">incl. {inr(d.collectedPrior)} against earlier bills</span></>
                      )}
                      {' '}· Unpaid on this period's bills{' '}
                      <b style={{ color: d.unpaid > 0.004 ? 'var(--bad)' : 'var(--good)' }}>{inr(d.unpaid || 0)}</b>
                    </span>
                  </div>
                  <Scroll>
                    <table>
                      <thead><tr>
                        <th>Procedure</th><th className="num">Times</th><th className="num">Billed</th><th className="num">Collected</th>
                      </tr></thead>
                      <tbody>
                        {d.procedures.map((p, i) => (
                          <tr key={i}>
                            <td>
                              {p.name}
                              {(p.prior || 0) > 0.004 && (p.billed || 0) <= 0.004 && <span className="tag y"> earlier bill</span>}
                            </td>
                            <td className="num">{p.qty}</td>
                            <td className="num b">{inr(p.billed)}</td>
                            <td className="num">{inr(p.collected)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: '#fafbfc' }}>
                          <td className="b right">Total</td><td />
                          <td className="num b">{inr(d.billed)}</td>
                          <td className="num b">{inr(d.collected)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </Scroll>
                </Card>
              ))}
            </>
          )}
      </div>
    </>
  );
}
