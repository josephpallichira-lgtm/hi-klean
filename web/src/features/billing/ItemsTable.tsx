import { inr } from '@shared/lib/money';
import { shortDoc } from '@shared/lib/text';
import { useSession } from '@/app/session';
import { Card, Scroll } from '@shared/ui/primitives';
import type { BillDraft, InvoiceItem } from '@shared/types';

export function ItemsTable({ draft, onChange, onRemove, onTeeth }: {
  draft: BillDraft;
  onChange: (index: number, patch: Partial<InvoiceItem>) => void;
  onRemove: (index: number) => void;
  onTeeth: (index: number) => void;
}) {
  const { activeDoctors, multiDoctor } = useSession();
  const cols = 8 + (draft.gstOn ? 1 : 0) + (multiDoctor ? 1 : 0);

  // Line amounts are computed by calcDraft() BEFORE this renders — a freshly
  // added treatment otherwise draws ₹0.00 on a row the sub total already counts,
  // which made the line look free until it was touched.
  return (
    <Card className="mt">
      <Scroll>
        <table>
          <thead><tr>
            <th style={{ width: 32 }}>#</th>
            <th>Treatment</th>
            {multiDoctor && <th style={{ width: 135 }}>Doctor</th>}
            <th style={{ width: 180 }}>Description / Tooth</th>
            <th style={{ width: 62 }} className="num">Nos</th>
            <th style={{ width: 100 }} className="num">Rate</th>
            <th style={{ width: 90 }} className="num">Disc</th>
            {draft.gstOn && <th style={{ width: 70 }}>GST</th>}
            <th style={{ width: 110 }} className="num">Amount</th>
            <th style={{ width: 38 }} />
          </tr></thead>
          <tbody id="itemsBody">
            {draft.items.length ? draft.items.map((it, i) => (
              <tr key={i} data-i={i}>
                <td className="mut">{i + 1}</td>
                <td>
                  <input data-f="name" value={it.name} style={{ borderColor: 'transparent', paddingLeft: 4, fontWeight: 600 }}
                    onChange={(e) => onChange(i, { name: e.target.value })} />
                </td>
                {multiDoctor && (
                  <td>
                    <select data-f="docId" value={String(it.docId ?? '')}
                      onChange={(e) => onChange(i, { docId: Number(e.target.value) })}>
                      {activeDoctors.map((d) => <option key={d.id} value={d.id}>{shortDoc(d.name)}</option>)}
                    </select>
                  </td>
                )}
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input data-f="desc" value={it.desc} placeholder={it.perTooth ? 'tooth no.' : '—'}
                      onChange={(e) => onChange(i, { desc: e.target.value })} />
                    <button className="btn sm" data-act="teeth" onClick={() => onTeeth(i)}>Tooth</button>
                  </div>
                </td>
                <td><input data-f="qty" className="num" value={it.qty}
                  onChange={(e) => onChange(i, { qty: e.target.value === '' ? 0 : Number(e.target.value) })} /></td>
                <td><input data-f="rate" className="num" value={it.rate}
                  onChange={(e) => onChange(i, { rate: e.target.value === '' ? 0 : Number(e.target.value) })} /></td>
                <td><input data-f="disc" className="num" value={it.disc || ''} placeholder="0"
                  onChange={(e) => onChange(i, { disc: e.target.value === '' ? 0 : Number(e.target.value) })} /></td>
                {draft.gstOn && (
                  <td>
                    <label className="switch">
                      <input type="checkbox" data-f="taxable" checked={!!it.taxable}
                        onChange={(e) => onChange(i, { taxable: e.target.checked })} />
                      {it.gst}%
                    </label>
                    {it.taxable && (
                      <select data-f="gstIncl" className="xs" style={{ padding: '2px 4px', marginTop: 3 }}
                        value={it.gstIncl !== false ? '1' : '0'}
                        onChange={(e) => onChange(i, { gstIncl: e.target.value === '1' })}>
                        <option value="1">incl.</option>
                        <option value="0">extra</option>
                      </select>
                    )}
                  </td>
                )}
                <td className="num b" data-amt>{inr(it.amount || 0)}</td>
                <td className="right"><button className="btn sm d" data-act="del" onClick={() => onRemove(i)}>✕</button></td>
              </tr>
            )) : (
              <tr><td colSpan={cols}><div className="empty sm">No treatment added yet — pick from the list above.</div></td></tr>
            )}
          </tbody>
        </table>
      </Scroll>
    </Card>
  );
}
