import { useCallback } from 'react';
import { adminApi, usersApi } from '@shared/api/endpoints';
import { useModal } from '@shared/ui/Modal';
import { useToast } from '@shared/ui/Toast';
import { Field, Scroll } from '@shared/ui/primitives';

const suggestion = () => Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);

export function useAddUser() {
  const modal = useModal();
  const toast = useToast();

  return useCallback((onDone: () => void) => {
    const st = { username: '', fullName: '', role: 'staff', password: suggestion() };
    modal.open({
      title: 'Add user',
      body: (
        <>
          <div className="row">
            <Field label="Username *" style={{ flex: 1 }}>
              <input id="uu" autoCapitalize="none" placeholder="e.g. reception" onChange={(e) => { st.username = e.target.value; }} />
            </Field>
            <Field label="Full name" style={{ flex: 1 }}>
              <input id="uf" onChange={(e) => { st.fullName = e.target.value; }} />
            </Field>
          </div>
          <div className="row mt">
            <Field label="Access" style={{ width: 190 }}>
              <select id="ur" defaultValue="staff" onChange={(e) => { st.role = e.target.value; }}>
                <option value="staff">Staff — billing only</option>
                <option value="admin">Admin — everything</option>
              </select>
            </Field>
            <Field label="Password (min 8) *" style={{ flex: 1 }}>
              <input id="up" type="text" defaultValue={st.password} onChange={(e) => { st.password = e.target.value; }} />
            </Field>
          </div>
          <p className="sm mut mt">Give this password to the person — the app will ask them to set their own at first login.</p>
        </>
      ),
      footer: (
        <>
          <button className="btn" onClick={modal.close}>Cancel</button>
          <button className="btn p" id="uok" onClick={async () => {
            try {
              await usersApi.create(st);
              modal.close();
              toast('User created');
              onDone();
            } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
          }}>Create</button>
        </>
      ),
    });
  }, [modal, toast]);
}

export function useResetPassword() {
  const modal = useModal();
  const toast = useToast();

  return useCallback((id: number | string) => {
    const st = { password: suggestion() };
    modal.open({
      title: 'Reset password',
      body: (
        <>
          <Field label="New password (min 8)">
            <input id="rp1" type="text" defaultValue={st.password} onChange={(e) => { st.password = e.target.value; }} />
          </Field>
          <p className="sm mut mt">They will be asked to set their own password at next login.</p>
        </>
      ),
      footer: (
        <>
          <button className="btn" onClick={modal.close}>Cancel</button>
          <button className="btn p" id="rpok" onClick={async () => {
            try { await usersApi.patch(id, { password: st.password }); modal.close(); toast('Password reset'); }
            catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
          }}>Set</button>
        </>
      ),
    });
  }, [modal, toast]);
}

export function useAuditLog() {
  const modal = useModal();
  const toast = useToast();

  return useCallback(async () => {
    try {
      const rows = await adminApi.audit();
      modal.open({
        title: 'Audit log — last 300 actions',
        wide: true,
        body: (
          <Scroll style={{ maxHeight: '60vh' }}>
            <table>
              <thead><tr><th>When</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sm">{new Date(r.at).toLocaleString('en-IN')}</td>
                    <td className="b">{r.username}</td>
                    <td>{r.action}</td>
                    <td className="sm mut">{JSON.stringify(r.detail).slice(1, -1).slice(0, 90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        ),
      });
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
  }, [modal, toast]);
}
