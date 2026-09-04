import { useState } from 'react';
import { patientsApi } from '@shared/api/endpoints';
import { useAsync, useDebounced } from '@shared/hooks/useAsync';
import { useDataVersion } from '@shared/lib/refresh';
import { navigate } from '@/app/router';
import { Card, Empty, Field, PageHead } from '@shared/ui/primitives';
import { usePatientEditor } from './usePatientEditor';

export function PatientListPage() {
  const [q, setQ] = useState('');
  const term = useDebounced(q, 300);
  const version = useDataVersion();
  const edit = usePatientEditor();

  const { data, loading, error } = useAsync(
    () => patientsApi.search(term.trim().length >= 2 ? term.trim() : undefined),
    [term, version]);

  const list = data || [];

  return (
    <>
      <PageHead title="Patients" sub="Search by name, phone or patient ID"
        actions={<button className="btn p" id="pnew" onClick={() => edit(null)}>＋ Add patient</button>} />

      <Card pad>
        <div className="row">
          <Field label="Search" style={{ flex: 1 }}>
            <input id="pq" placeholder="Type at least 2 letters" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="mt">
        <div className="scroll" id="plist">
          {loading ? <div className="empty">Loading…</div>
            : error ? <div className="empty">⚠ {error}</div>
            : list.length ? (
              <table>
                <thead><tr><th>Patient ID</th><th>Name</th><th>Age/Sex</th><th>Phone</th><th /></tr></thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td className="mut">{p.reg || ''}</td>
                      <td className="b">{p.name}</td>
                      <td>{p.age || ''}{p.sex ? ' / ' + String(p.sex)[0] : ''}</td>
                      <td>{p.phone || ''}</td>
                      <td className="right">
                        <button className="btn sm" onClick={() => navigate('patients/' + p.id)}>History</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty icon="☺">No patients found.</Empty>}
        </div>
      </Card>
    </>
  );
}
