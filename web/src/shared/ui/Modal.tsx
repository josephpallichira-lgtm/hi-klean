import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface ModalSpec {
  title: string;
  body: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Only changes what the dialog says and whether it offers Cancel. It does
   *  NOT trap the user: the original app let Escape and a backdrop click close
   *  the first-login password dialog, and staff rely on that. */
  forced?: boolean;
}

interface ModalApi {
  open: (spec: ModalSpec) => void;
  close: () => void;
  confirm: (message: ReactNode, onYes: () => void, yesLabel?: string) => void;
}

const Ctx = createContext<ModalApi>({ open: () => {}, close: () => {}, confirm: () => {} });
export const useModal = () => useContext(Ctx);

export function ModalProvider({ children }: { children: ReactNode }) {
  // ONE slot, not a stack. Opening a dialog REPLACES whatever was showing, and
  // closing clears the screen — matching the original app exactly. A stack looks
  // tidier but leaves the bill's detail modal hanging behind a confirmation the
  // user has already answered.
  const [current, setCurrent] = useState<ModalSpec | null>(null);
  const close = useCallback(() => setCurrent(null), []);
  const open = useCallback((spec: ModalSpec) => setCurrent(spec), []);

  const confirm = useCallback((message: ReactNode, onYes: () => void, yesLabel?: string) => {
    open({
      title: 'Please confirm',
      body: <p style={{ margin: 0 }}>{message}</p>,
      footer: (
        <>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn d" onClick={() => { close(); onYes(); }}>{yesLabel || 'Yes'}</button>
        </>
      ),
    });
  }, [open, close]);

  const top = current;
  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [top, close]);

  return (
    <Ctx.Provider value={{ open, close, confirm }}>
      {children}
      <div id="modal">
        {top && (
          <div className="mask" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
            <div className={'modal' + (top.wide ? ' wide' : '')}>
              <div className="mh">
                <h3>{top.title}</h3>
                <button className="x" aria-label="Close" onClick={close}>&times;</button>
              </div>
              <div className="mb">{top.body}</div>
              {top.footer && <div className="mf">{top.footer}</div>}
            </div>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
