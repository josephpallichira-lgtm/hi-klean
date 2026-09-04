import { inr } from '@shared/lib/money';
import type { Totals } from '@shared/lib/money';
import type { BillDraft } from '@shared/types';

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '3px 0' };

export function TotalsPanel({ draft, totals, patch }: {
  draft: BillDraft; totals: Totals; patch: (p: Partial<BillDraft>) => void;
}) {
  return (
    <div className="pad" id="totBox">
      <div style={{ maxWidth: 340, marginLeft: 'auto', fontSize: 14 }}>
        <div style={row}><span className="mut">Sub total</span><b>{inr(totals.sub)}</b></div>

        <div style={{ ...row, alignItems: 'center', gap: 8 }}>
          <span className="mut">Discount</span>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span className="seg">
              <button id="dAmt" className={draft.discType !== 'pct' ? 'on' : ''}
                onClick={() => patch({ discType: 'amt' })}>₹</button>
              <button id="dPct" className={draft.discType === 'pct' ? 'on' : ''}
                onClick={() => patch({ discType: 'pct' })}>%</button>
            </span>
            <input id="dVal" className="num" style={{ width: 86 }} placeholder="0"
              value={draft.discValue || ''}
              onChange={(e) => patch({ discValue: Number(e.target.value) || 0 })} />
          </span>
        </div>

        {!!totals.disc && (
          <div style={{ ...row, color: 'var(--bad)' }}><span>Less discount</span><b>− {inr(totals.disc)}</b></div>
        )}
        {!!totals.taxAdd && (
          <div style={row}><span className="mut">CGST + SGST (added)</span><b>{inr(totals.taxAdd)}</b></div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0 0', marginTop: 6, borderTop: '2px solid var(--acc)', fontSize: 19, color: 'var(--acc)' }}>
          <b>Net Amount</b><b>{inr(totals.total)}</b>
        </div>
        {!!totals.taxIncl && (
          <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--mut)', marginTop: 3 }}>
            includes CGST + SGST {inr(totals.taxIncl)}
          </div>
        )}
      </div>
    </div>
  );
}
