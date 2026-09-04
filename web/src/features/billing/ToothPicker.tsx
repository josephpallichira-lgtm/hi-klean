import { TEETH } from './draft';

export interface ToothSelection { teeth: number[]; setQty: boolean }

/**
 * FDI tooth chart, fully controlled so the modal footer can own the Apply
 * button (tests and muscle memory both target #tOk there).
 *
 * "Set Nos = number of teeth" defaults on only for per-tooth procedures — a
 * per-visit procedure billed x3 because three teeth were treated would
 * overcharge the patient.
 */
export function ToothPicker({ value, onChange, perTooth, permanent, onArch }: {
  value: ToothSelection;
  onChange: (v: ToothSelection) => void;
  perTooth: boolean;
  permanent: boolean;
  onArch: (permanent: boolean) => void;
}) {
  const toggle = (t: number) =>
    onChange({ ...value, teeth: value.teeth.includes(t) ? value.teeth.filter((x) => x !== t) : [...value.teeth, t] });

  const Row = ({ arr, left }: { arr: readonly number[]; left?: boolean }) => (
    <div className={'qrow' + (left ? ' l' : '')}>
      {arr.map((t) => (
        <button key={t} type="button" className={'tooth' + (value.teeth.includes(t) ? ' on' : '')}
          data-t={t} onClick={() => toggle(t)}>{t}</button>
      ))}
    </div>
  );

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="seg">
          <button id="tPerm" type="button" className={permanent ? 'on' : ''} onClick={() => onArch(true)}>Permanent</button>
          <button id="tDec" type="button" className={!permanent ? 'on' : ''} onClick={() => onArch(false)}>Milk teeth</button>
        </span>
        <span className="mut sm">FDI numbering</span>
      </div>

      <div className="teeth" id="tGrid">
        {permanent ? (
          <>
            <div className="quad"><Row arr={TEETH.UP_R} /><Row arr={TEETH.UP_L} left /></div>
            <div className="midline" />
            <div className="quad"><Row arr={TEETH.LO_R} /><Row arr={TEETH.LO_L} left /></div>
          </>
        ) : (
          <>
            <div className="quad"><Row arr={TEETH.DUP_R} /><Row arr={TEETH.DUP_L} left /></div>
            <div className="midline" />
            <div className="quad"><Row arr={TEETH.DLO_R} /><Row arr={TEETH.DLO_L} left /></div>
          </>
        )}
      </div>

      <div className="mt">
        <b id="tSel" className="sm">
          {value.teeth.length ? 'Selected: ' + [...value.teeth].sort((a, b) => a - b).join(', ') : 'Nothing selected'}
        </b>
      </div>

      <div className="mt">
        <label className="switch">
          <input type="checkbox" id="tQty" checked={value.setQty}
            onChange={(e) => onChange({ ...value, setQty: e.target.checked })} />
          {' '}Set “Nos” = number of teeth
          {!perTooth && <span className="mut xs"> (priced per visit, not per tooth)</span>}
        </label>
      </div>
    </>
  );
}
