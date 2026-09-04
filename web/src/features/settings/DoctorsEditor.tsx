import { useToast } from '@shared/ui/Toast';
import { Field } from '@shared/ui/primitives';
import type { Doctor } from '@shared/types';

const ROWS: [keyof Doctor, string, number][] = [
  ['name', 'Name & qualification', 0],
  ['spec', 'Speciality line', 0],
  ['role_line', 'Designation', 0],
  ['reg_no', 'Reg. No.', 100],
  ['sign_title', 'Signature title', 140],
];

export function DoctorsEditor({ doctors, onChange, onDelete }: {
  doctors: Doctor[];
  onChange: (d: Doctor[]) => void;
  onDelete: (id: number) => void;
}) {
  const toast = useToast();

  const patch = (i: number, k: keyof Doctor, v: string) =>
    onChange(doctors.map((d, x) => (x === i ? { ...d, [k]: v } : d)));

  return (
    <>
      <div id="docBox">
        {doctors.map((d, i) => (
          <div className="row" data-di={i} key={d.id ?? 'new' + i} style={{ marginBottom: 8 }}>
            {ROWS.map(([k, label, w]) => (
              <Field key={k} label={label} style={w ? { width: w } : { flex: 1, minWidth: 150 }}>
                <input data-df={k} value={String(d[k] ?? '')} onChange={(e) => patch(i, k, e.target.value)} />
              </Field>
            ))}
            <button className="btn sm d" data-dx={i} style={{ marginBottom: 2 }} onClick={() => {
              if (doctors.length < 2) return toast('Keep at least one doctor', true);
              if (d.id) onDelete(d.id);
              onChange(doctors.filter((_, x) => x !== i));
            }}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn sm mt" id="docAdd" onClick={() =>
        onChange([...doctors, { name: 'New Doctor', spec: '', role_line: '', reg_no: '', sign_title: '', active: true }])}>
        ＋ Add doctor
      </button>
    </>
  );
}
