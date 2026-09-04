import { useCallback } from 'react';
import { invoicesApi } from '@shared/api/endpoints';
import { bumpData } from '@shared/lib/refresh';
import { dmy } from '@shared/lib/date';
import { navigate } from '@/app/router';
import { useSession } from '@/app/session';
import { useModal } from '@shared/ui/Modal';
import { useToast } from '@shared/ui/Toast';
import { Field } from '@shared/ui/primitives';
import { usePrintDocument } from '@shared/hooks/usePrintDocument';
import { InvoiceDetail } from './InvoiceDetail';
import type { Invoice } from '@shared/types';

/**
 * Opens a bill. Used from the dashboard, the bills list, the patient card and
 * every drill-down, so it lives here rather than being rebuilt per screen.
 */
export function useInvoiceModal() {
  const modal = useModal();
  const toast = useToast();
  const { isAdmin } = useSession();
  const { printBill } = usePrintDocument();

  const voidBill = useCallback((inv: Invoice) => {
    const state = { reason: '' };
    modal.open({
      title: 'Cancel bill ' + inv.no,
      body: (
        <>
          <p style={{ marginTop: 0 }} className="sm mut">
            Bills are never deleted — cancelling keeps the record and the reason, so the number sequence stays auditable.
          </p>
          <Field label="Reason *"><input id="vr" placeholder="e.g. billed twice by mistake"
            onChange={(e) => { state.reason = e.target.value; }} /></Field>
        </>
      ),
      footer: (
        <>
          <button className="btn" onClick={modal.close}>Back</button>
          <button className="btn d" id="vok" onClick={async () => {
            try {
              await invoicesApi.void(inv.id, state.reason);
              modal.close();
              toast('Bill cancelled');
              bumpData();
            } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
          }}>Cancel this bill</button>
        </>
      ),
    });
  }, [modal, toast]);

  return useCallback(async (id: number) => {
    let inv: Invoice;
    try { inv = await invoicesApi.get(id); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), true); return; }

    modal.open({
      title: (inv.type === 'estimate' ? 'Estimate ' : 'Bill ') + inv.no + ' · ' + dmy(inv.date),
      wide: true,
      body: <InvoiceDetail invoice={inv} />,
      footer: (
        <>
          {isAdmin && <button className="btn d" id="iVoid" onClick={() => voidBill(inv)}>Cancel bill</button>}
          {inv.type === 'estimate' && (
            <button className="btn" id="iConv" onClick={async () => {
              try {
                const r = await invoicesApi.convert(inv.id);
                modal.close();
                toast('Converted to Bill ' + r.no);
                bumpData();
              } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
            }}>Convert to Bill</button>
          )}
          <button className="btn" onClick={() => { modal.close(); navigate('bill/' + inv.id); }}>Edit</button>
          <button className="btn" onClick={() => printBill(inv, true)}>Thermal</button>
          <button className="btn p" onClick={() => printBill(inv)}>🖨 Print A4</button>
        </>
      ),
    });
  }, [modal, toast, isAdmin, voidBill, printBill]);
}
