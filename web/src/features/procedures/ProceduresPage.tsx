import { useMemo, useState } from 'react';
import { proceduresApi } from '@shared/api/endpoints';
import { useAsync } from '@shared/hooks/useAsync';
import { useSession } from '@/app/session';
import { useToast } from '@shared/ui/Toast';
import { Card, Field, PageHead } from '@shared/ui/primitives';
import { useProcedureEditor, useBulkPrice } from './useProcedureEditor';
import type { Procedure } from '@shared/types';

export function ProceduresPage() {
  const { isAdmin, settings, setProcedures } = useSession();
  const toast = useToast();
  const editProc = useProcedureEditor();
  const bulkPrice = useBulkPrice();
  const [f, setF] = useState({ q: '', cat: 'all', hidden: false });
  const { data, loading, reload } = useAsync(() => proceduresApi.list().then((p) => { setProcedures(p); return p; }), []);
  const [local, setLocal] = useState<Procedure[] | null>(null);
  const procs = local || data || [];

  const cats = useMemo(() => [...new Set(procs.map((p) => p.cat))], [procs]);
  const s = f.q.trim().toLowerCase();
  const list = procs.filter((p) =>
    (f.hidden || p.active) && (f.cat === 'all' || p.cat === f.cat) && (!s || p.name.toLowerCase().includes(s)));

  async function save(id: number, body: Partial<Procedure>) {
    try {
      const updated = await proceduresApi.patch(id, body);
      setLocal((cur) => (cur || procs).map((p) => (p.id === id ? { ...p, ...updated } : p)));
      toast((procs.find((p) => p.id === id)?.name || 'Procedure') + ' updated');
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
  }

  return (
    <>
      <PageHead title="Procedures & Rates"
        sub={`${procs.length} procedures${isAdmin ? ' · type a new price and press Tab to save' : ' · view only'}`}
        actions={isAdmin ? (
          <>
            <button className="btn" id="prBulk" onClick={() => bulkPrice(procs, reload)}>Bulk price change</button>
            <button className="btn p" id="prNew" onClick={() => editProc(null, procs, () => { setLocal(null); reload(); })}>＋ Add procedure</button>
          </>
        ) : undefined}
      />

      <Card pad>
        <div className="row">
          <Field label="Search" style={{ flex: 1, minWidth: 180 }}>
            <input id="prq" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </Field>
          <Field label="Category" style={{ minWidth: 180 }}>
            <select id="prc" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
              <option value="all">All categories</option>
              {cats.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <label className="switch" style={{ paddingBottom: 9 }}>
            <input type="checkbox" id="prh" checked={f.hidden} onChange={(e) => setF({ ...f, hidden: e.target.checked })} />
            {' '}show hidden
          </label>
        </div>
      </Card>

      <Card className="mt">
        <div className="scroll" id="prlist">
          {loading ? <div className="empty">Loading…</div>
            : list.length ? (
              <table>
                <thead><tr>
                  <th>Procedure</th><th>Category</th>
                  <th style={{ width: 130 }} className="num">Price (₹)</th>
                  <th style={{ width: 80 }}>Per tooth</th>
                  {settings.gstEnabled && <><th style={{ width: 110 }}>GST</th><th style={{ width: 140 }}>Price is</th></>}
                  <th style={{ width: 60 }}>Show</th>
                  {isAdmin && <th style={{ width: 70 }} />}
                </tr></thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id} data-id={p.id}>
                      <td className="b">{p.name}</td>
                      <td className="sm mut">{p.cat}</td>
                      <td>
                        <input className="num" data-f="price" defaultValue={p.price} readOnly={!isAdmin}
                          onBlur={(e) => {
                            if (!isAdmin) return;
                            if (e.target.value.trim() === '') { e.target.value = String(p.price); return; }
                            const v = Math.max(0, Number(e.target.value) || 0);
                            if (v !== p.price) save(p.id, { price: v });
                          }} />
                      </td>
                      <td className="center">
                        <input type="checkbox" data-f="perTooth" checked={p.perTooth} disabled={!isAdmin}
                          style={{ width: 16, accentColor: 'var(--acc)' }}
                          onChange={(e) => save(p.id, { perTooth: e.target.checked })} />
                      </td>
                      {settings.gstEnabled && (
                        <>
                          <td>
                            <label className="switch">
                              <input type="checkbox" data-f="taxable" checked={p.taxable} disabled={!isAdmin}
                                onChange={(e) => save(p.id, { taxable: e.target.checked })} />
                              <input className="num" data-f="gst" defaultValue={p.gst} style={{ width: 46 }} readOnly={!isAdmin}
                                onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== p.gst) save(p.id, { gst: v }); }} />%
                            </label>
                          </td>
                          <td>
                            <select data-f="gstIncl" disabled={!isAdmin} value={p.gstIncl !== false ? '1' : '0'}
                              onChange={(e) => save(p.id, { gstIncl: e.target.value === '1' })}>
                              <option value="1">GST included</option>
                              <option value="0">GST extra</option>
                            </select>
                          </td>
                        </>
                      )}
                      <td className="center">
                        <input type="checkbox" data-f="active" checked={p.active} disabled={!isAdmin}
                          style={{ width: 16, accentColor: 'var(--acc)' }}
                          onChange={(e) => save(p.id, { active: e.target.checked })} />
                      </td>
                      {isAdmin && (
                        <td className="right">
                          <button className="btn sm" data-act="edit"
                            onClick={() => editProc(p, procs, () => { setLocal(null); reload(); })}>Edit</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">No procedure matches.</div>}
        </div>
      </Card>
    </>
  );
}
