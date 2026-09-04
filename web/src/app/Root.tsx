import { useCallback, useEffect, useState } from 'react';
import { auth, proceduresApi, settingsApi } from '@shared/api/endpoints';
import { setUnauthorizedHandler } from '@shared/api/client';
import { ModalProvider } from '@shared/ui/Modal';
import { ToastProvider } from '@shared/ui/Toast';
import { LoginScreen } from '@features/auth/LoginScreen';
import { useChangePassword } from '@features/auth/ChangePassword';
import { SessionProvider } from './session';
import { AppShell } from './AppShell';
import type { Counters, Doctor, Procedure, Settings, User } from '@shared/types';

interface Loaded {
  user: User;
  settings: Settings;
  doctors: Doctor[];
  counters: Counters;
  procedures: Procedure[];
}

export function Root() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [notice, setNotice] = useState<string | undefined>();
  const [checking, setChecking] = useState(true);

  const loadEverything = useCallback(async (user: User) => {
    const [s, procedures] = await Promise.all([settingsApi.get(), proceduresApi.list()]);
    setLoaded({ user, settings: s.settings, doctors: s.doctors, counters: s.counters, procedures });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setLoaded(null);
      setNotice('Your session ended. Please sign in again.');
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await auth.me();
        await loadEverything(me.user);
      } catch {
        // not signed in — the login screen needs the clinic name and logo, and
        // /settings is behind auth, so we simply show the plain form.
      } finally { setChecking(false); }
    })();
  }, [loadEverything]);

  if (checking) return null;

  // SessionProvider must sit ABOVE ModalProvider: modal bodies (a bill's detail,
  // the tooth picker) call useSession(), and the modal renders from the provider
  // that owns it — not from the component that opened it.
  return (
    <ToastProvider>
      {loaded
        ? (
          <SessionProvider initial={loaded}>
            <ModalProvider>
              <SignedIn mustChange={!!loaded.user.mustChange} />
            </ModalProvider>
          </SessionProvider>
        )
        : (
          <ModalProvider>
            <LoginScreen
              settings={{}}
              notice={notice}
              onSignedIn={async (u) => { setNotice(undefined); await loadEverything(u); }}
            />
          </ModalProvider>
        )}
    </ToastProvider>
  );
}

function SignedIn({ mustChange }: { mustChange: boolean }) {
  const changePassword = useChangePassword();
  useEffect(() => { if (mustChange) changePassword(true); }, [mustChange]); // eslint-disable-line react-hooks/exhaustive-deps
  return <AppShell />;
}
