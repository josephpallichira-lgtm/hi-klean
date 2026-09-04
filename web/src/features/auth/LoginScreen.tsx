import { useEffect, useRef, useState, type FormEvent } from 'react';
import { auth } from '@shared/api/endpoints';
import { safeLogo } from '@shared/lib/text';
import type { Settings, User } from '@shared/types';

const input: React.CSSProperties = {
  width: '100%', padding: 11, margin: '4px 0 12px',
  border: '1px solid #d7dee6', borderRadius: 9, fontSize: 16,
};

export function LoginScreen({ settings, notice, onSignedIn }: {
  settings: Settings; notice?: string; onSignedIn: (u: User) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { const t = setTimeout(() => first.current?.focus(), 80); return () => clearTimeout(t); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await auth.login(username, password);
      onSignedIn(r.user);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
      setBusy(false);
    }
  }

  const logo = safeLogo(settings.logo);
  return (
    <div id="login">
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d2b33', padding: 18 }}>
        <form id="lf" onSubmit={submit}
          style={{ background: '#fff', padding: 26, borderRadius: 16, width: 340, maxWidth: '100%', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
          {logo && <img src={logo} alt="" style={{ width: 120, display: 'block', margin: '0 auto 12px' }} />}
          <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 17 }}>
            {settings.clinicName || 'Hi-Klean Dental Clinic'}
          </div>
          <div style={{ textAlign: 'center', color: '#68798a', fontSize: 12.5, marginBottom: 16 }}>Billing system</div>
          {notice && (
            <div style={{ background: '#fdf3e3', color: '#7a5310', padding: '8px 10px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
              {notice}
            </div>
          )}
          <label style={{ fontSize: 12, color: '#68798a', fontWeight: 700 }}>Username</label>
          <input id="lu" ref={first} autoComplete="username" autoCapitalize="none" style={input}
            value={username} onChange={(e) => setUsername(e.target.value)} />
          <label style={{ fontSize: 12, color: '#68798a', fontWeight: 700 }}>Password</label>
          <input id="lp" type="password" autoComplete="current-password" style={{ ...input, margin: '4px 0 16px' }}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <button id="lb" disabled={busy}
            style={{ width: '100%', padding: 12, border: 0, borderRadius: 9, background: '#0a7d78', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Sign in
          </button>
          <div id="lerr" style={{ color: '#c0392b', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{err}</div>
        </form>
      </div>
    </div>
  );
}
