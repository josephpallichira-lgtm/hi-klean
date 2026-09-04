import { useCallback } from 'react';
import { proceduresApi } from '@shared/api/endpoints';
import { useModal } from '@shared/ui/Modal';
import { useToast } from '@shared/ui/Toast';
import { Field } from '@shared/ui/primitives';
import type { Procedure } from '@shared/types';

export function useProcedureEditor() {
  const modal = useModal();
  const toast = useToast();

  return useCallback((existing: Procedure | null, all: Procedure[], onSaved: () => void) => {
    const isNew = !existing;
    const p = existing || ({ cat: 'Others', price: 0, gst: 18, gstIncl: true } as Partial<Procedure>);
    const cats = [...new Set(all.map((x) => x.cat))];
    const st = {
      name: p.name || '', cat: p.cat || 'Others', newCat: '', price: String(p.price ?? 0),
      perTooth: !!p.perTooth, taxable: !!p.taxable, gst: String(p.gst ?? 18),
      gstIncl: p.gstIncl !== false, active: p.active !== false,
    };

    const Body = () => {
      return (
        <>
          <Field label="Procedure name *"><input id="pr_n" defaultValue={st.name} onChange={(e) => { st.name = e.target.value; }} /></Field>
          <div className="row mt">
            <Field label="Category" style={{ flex: 1, minWidth: 180 }}>
              <select id="pr_c" defaultValue={st.cat} onChange={(e) => {
                st.cat = e.target.value;
                const box = document.getElementById('pr_nc');
                if (box) box.innerHTML = '';
                if (e.target.value === '__new' && box) {
                  const wrap = document.createElement('div');
                  wrap.className = 'f mt';
                  wrap.innerHTML = '<label>New category name</label><input id="pr_ncn"/>';
                  box.appendChild(wrap);
                  wrap.querySelector('input')!.addEventListener('input', (ev) => {
                    st.newCat = (ev.target as HTMLInputElement).value;
                  });
                }
              }}>
                {cats.map((c) => <option key={c}>{c}</option>)}
                <option value="__new">➕ New category…</option>
              </select>
            </Field>
            <Field label="Price (₹)" style={{ width: 130 }}>
              <input id="pr_p" className="num" defaultValue={st.price} onChange={(e) => { st.price = e.target.value; }} />
            </Field>
          </div>
          <div id="pr_nc" />
          <div className="row mt">
            <label className="switch">
              <input type="checkbox" id="pr_t" defaultChecked={st.perTooth} onChange={(e) => { st.perTooth = e.target.checked; }} />
              {' '}Charged per tooth
            </label>
            <label className="switch">
              <input type="checkbox" id="pr_x" defaultChecked={st.taxable} onChange={(e) => { st.taxable = e.target.checked; }} />
              {' '}GST applicable
            </label>
            <Field label="GST %" style={{ width: 90 }}>
              <input id="pr_g" className="num" defaultValue={st.gst} onChange={(e) => { st.gst = e.target.value; }} />
            </Field>
            <Field label="The price above" style={{ minWidth: 190 }}>
              <select id="pr_gi" defaultValue={st.gstIncl ? '1' : '0'} onChange={(e) => { st.gstIncl = e.target.value === '1'; }}>
                <option value="1">already includes GST</option>
                <option value="0">is before GST (add it on top)</option>
              </select>
            </Field>
          </div>
          <div className="mut xs" style={{ marginTop: -4 }}>
            "Already includes GST" means the patient pays exactly the price you typed; the tax is shown separately on the
            bill but not added to it.
          </div>
          {!isNew && (
            <div className="row mt">
              <label className="switch">
                <input type="checkbox" id="pr_a" defaultChecked={st.active} onChange={(e) => { st.active = e.target.checked; }} />
                {' '}Show in the billing list
              </label>
            </div>
          )}
        </>
      );
    };

    modal.open({
      title: isNew ? 'New procedure' : 'Edit procedure',
      body: <Body />,
      footer: (
        <>
          <button className="btn" onClick={modal.close}>Cancel</button>
          <button className="btn p" id="pr_s" onClick={async () => {
            const cat = st.cat === '__new' ? (st.newCat || 'Others') : st.cat;
            const body: Partial<Procedure> = {
              name: st.name.trim(), cat, price: Number(st.price) || 0,
              perTooth: st.perTooth, taxable: st.taxable, gst: Number(st.gst) || 0, gstIncl: st.gstIncl,
            };
            if (!isNew) body.active = st.active;
            if (!body.name) return toast('Name required', true);
            try {
              if (isNew) await proceduresApi.create(body);
              else await proceduresApi.patch(existing!.id, body);
              modal.close();
              toast('Saved');
              onSaved();
            } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
          }}>Save</button>
        </>
      ),
    });
  }, [modal, toast]);
}

export function useBulkPrice() {
  const modal = useModal();
  const toast = useToast();

  return useCallback((all: Procedure[], onDone: () => void) => {
    const cats = [...new Set(all.map((p) => p.cat))];
    const st = { cat: 'all', pct: '10', round: '10' };
    modal.open({
      title: 'Bulk price change',
      body: (
        <>
          <div className="row">
            <Field label="Apply to" style={{ flex: 1 }}>
              <select id="bk_c" defaultValue="all" onChange={(e) => { st.cat = e.target.value; }}>
                <option value="all">All procedures</option>
                {cats.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Change by %" style={{ width: 110 }}>
              <input id="bk_p" className="num" defaultValue="10" onChange={(e) => { st.pct = e.target.value; }} />
            </Field>
            <Field label="Round to" style={{ width: 130 }}>
              <select id="bk_r" defaultValue="10" onChange={(e) => { st.round = e.target.value; }}>
                <option value="1">₹1</option><option value="10">₹10</option>
                <option value="50">₹50</option><option value="100">₹100</option>
              </select>
            </Field>
          </div>
          <p className="sm mut mt">Negative to reduce. Every old price is kept in the price-history table.</p>
        </>
      ),
      footer: (
        <>
          <button className="btn" onClick={modal.close}>Cancel</button>
          <button className="btn p" id="bk_go" onClick={async () => {
            try {
              const r = await proceduresApi.bulkPrice({
                category: st.cat, pct: Number(st.pct) || 0, roundTo: Number(st.round),
              });
              modal.close();
              toast(r.count + ' prices updated');
              onDone();
            } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
          }}>Apply</button>
        </>
      ),
    });
  }, [modal, toast]);
}
