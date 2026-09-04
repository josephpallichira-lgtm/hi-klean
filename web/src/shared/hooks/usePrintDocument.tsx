import { useCallback } from 'react';
import { useModal } from '@shared/ui/Modal';
import { useToast } from '@shared/ui/Toast';
import { useSession } from '@/app/session';
import { billHTML, summaryHTML, thermalHTML } from '@features/printing/documents';
import { printDocument } from '@features/printing/printDocument';
import type { Invoice, Patient } from '@shared/types';

/** The one hook every screen uses to print. Screens never touch #printarea. */
export function usePrintDocument() {
  const { settings, billingDoctor } = useSession();
  const toast = useToast();
  const modal = useModal();

  const ctx = { settings, billingDoctor };

  const run = useCallback((html: string, thermal?: boolean) => {
    printDocument(html, thermal, {
      toast,
      offerBrowserFallback: ({ onStay, onOpen }) =>
        modal.open({
          title: 'Printing',
          body: (
            <>
              <p style={{ margin: '0 0 10px' }}>Android does not allow printing inside the installed app.</p>
              <p style={{ margin: 0, color: '#68798a', fontSize: 13.5 }}>
                Open the bill in your browser to print it or save it as a PDF. To avoid this every time,
                remove the Hi-Klean icon from your home screen and add it again from Chrome.
              </p>
            </>
          ),
          footer: (
            <>
              <button className="btn" id="pkStay" onClick={() => { modal.close(); onStay(); }}>Try printing here</button>
              <button className="btn p" id="pkOpen" onClick={() => { modal.close(); onOpen(); }}>Open bill in browser</button>
            </>
          ),
        }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, modal]);

  return {
    printBill: (inv: Invoice, thermal?: boolean) => run(thermal ? thermalHTML(inv, ctx) : billHTML(inv, ctx), thermal),
    printSummary: (p: Patient, bills: Invoice[], showAmounts: boolean) => run(summaryHTML(p, bills, showAmounts, ctx)),
  };
}
