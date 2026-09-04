import { useCallback, useState } from 'react';
import { useModal } from '@shared/ui/Modal';
import { ToothPicker, type ToothSelection } from './ToothPicker';
import type { InvoiceItem } from '@shared/types';

export function useToothPicker() {
  const modal = useModal();

  return useCallback((item: InvoiceItem, apply: (teeth: number[], setQty: boolean) => void) => {
    let current: ToothSelection = {
      teeth: (item.desc || '').split(/[,\s]+/).filter((s) => /^\d{2}$/.test(s)).map(Number),
      setQty: !!item.perTooth,
    };
    const Body = () => {
      const [value, setValue] = useState<ToothSelection>(current);
      const [permanent, setPermanent] = useState(true);
      const set = (v: ToothSelection) => { current = v; setValue(v); };
      return <ToothPicker value={value} onChange={set} perTooth={!!item.perTooth}
        permanent={permanent} onArch={setPermanent} />;
    };
    modal.open({
      title: 'Tooth numbers — ' + item.name,
      wide: true,
      body: <Body />,
      footer: (
        <>
          <button className="btn" onClick={modal.close}>Cancel</button>
          <button className="btn p" id="tOk" onClick={() => {
            modal.close();
            apply([...current.teeth].sort((a, b) => a - b), current.setQty);
          }}>Apply</button>
        </>
      ),
    });
  }, [modal]);
}
