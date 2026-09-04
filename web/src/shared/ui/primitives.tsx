import type { ReactNode, CSSProperties } from 'react';
import { inr } from '@shared/lib/money';

export function Card({ children, pad, className = '', style }:
  { children: ReactNode; pad?: boolean; className?: string; style?: CSSProperties }) {
  return <div className={`card${pad ? ' pad' : ''} ${className}`.trim()} style={style}>{children}</div>;
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="head">
      <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, style, className = '' }:
  { label?: ReactNode; children: ReactNode; style?: CSSProperties; className?: string }) {
  return <div className={`f ${className}`.trim()} style={style}>{label && <label>{label}</label>}{children}</div>;
}

export function Empty({ icon, children }: { icon?: string; children: ReactNode }) {
  return <div className="empty">{icon && <div className="big">{icon}</div>}{children}</div>;
}

/** One place decides how a balance reads. An overpayment must never say "Paid". */
export function BalanceTag({ bal, wide }: { bal: number; wide?: boolean }) {
  if (bal > 0.005) return <span className="tag r">{wide ? 'Balance ' : ''}{inr(bal)}</span>;
  if (bal < -0.005) return <span className="tag y">Advance {inr(-bal)}</span>;
  return <span className="tag g">{wide ? 'Fully paid' : 'Paid'}</span>;
}

export function Stat({ k, v, n, accent, color, onClick, active, className = '', dataKey, dataId }: {
  k: ReactNode; v: ReactNode; n?: ReactNode; accent?: boolean; color?: string;
  onClick?: () => void; active?: boolean; className?: string;
  /** stable hook for tests and for the drill-down each tile opens */
  dataKey?: string; dataId?: string | number;
}) {
  const cls = `stat${accent || active ? ' acc' : ''}${onClick ? ' tap' : ''} ${className}`.trim();
  const inner = (
    <>
      {onClick && <span className="go">{active ? '×' : '›'}</span>}
      <div className="k">{k}</div>
      <div className="v" style={color ? { color } : undefined}>{v}</div>
      {n !== undefined && <div className="n">{n}</div>}
    </>
  );
  return onClick
    ? <button type="button" className={cls} data-k={dataKey} data-id={dataId} onClick={onClick}>{inner}</button>
    : <div className={cls} data-k={dataKey} data-id={dataId}>{inner}</div>;
}

export function Scroll({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="scroll" style={style}>{children}</div>;
}
