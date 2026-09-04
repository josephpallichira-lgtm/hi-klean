import { auth } from '@shared/api/endpoints';
import { useModal } from '@shared/ui/Modal';
import { useToast } from '@shared/ui/Toast';
import { Field } from '@shared/ui/primitives';

/** Opens the change-password dialog. `forced` makes it undismissable — that is
 *  the first-login flow where an admin-issued password must be replaced. */
export function useChangePassword() {
  const modal = useModal();
  const toast = useToast();

  return (forced?: boolean) => {
    const state = { cur: '', a: '', b: '' };
    modal.open({
      title: forced ? 'Set your password' : 'Change password',
      forced,
      body: (
        <>
          {forced && (
            <p style={{ marginTop: 0 }} className="mut sm">
              You are signed in with the password an admin gave you. Set your own before you start billing.
            </p>
          )}
          <Field label="Current password">
            <input id="cp0" type="password" onChange={(e) => { state.cur = e.target.value; }} />
          </Field>
          <Field label="New password (min 8 characters)" className="mt">
            <input id="cp1" type="password" onChange={(e) => { state.a = e.target.value; }} />
          </Field>
          <Field label="Repeat new password" className="mt">
            <input id="cp2" type="password" onChange={(e) => { state.b = e.target.value; }} />
          </Field>
        </>
      ),
      footer: (
        <>
          {!forced && <button className="btn" onClick={modal.close}>Cancel</button>}
          <button className="btn p" id="cpok" onClick={async () => {
            if (state.a !== state.b) return toast('Passwords do not match', true);
            try {
              await auth.changePassword(state.cur, state.a);
              modal.close();
              toast('Password changed');
            } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
          }}>Save</button>
        </>
      ),
    });
  };
}
