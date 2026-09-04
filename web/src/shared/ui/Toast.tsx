import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ToastFn = (msg: string, bad?: boolean) => void;
const Ctx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ msg: string; bad?: boolean; on: boolean }>({ msg: '', on: false });
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const toast = useCallback<ToastFn>((msg, bad) => {
    setState({ msg, bad, on: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState((s) => ({ ...s, on: false })), 3000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div id="toast" className={(state.on ? 'on' : '') + (state.bad ? ' bad' : '')}>{state.msg}</div>
    </Ctx.Provider>
  );
}
