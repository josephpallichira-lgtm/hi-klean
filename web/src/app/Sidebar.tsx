import { safeLogo } from '@shared/lib/text';
import { navigate } from './router';
import { useSession } from './session';

/** [route, icon, label, adminOnly] */
const NAVS: [string, string, string, boolean][] = [
  ['dash', '⌂', 'Dashboard', false],
  ['bill', '＋', 'New Bill', false],
  ['invoices', '☰', 'Bills', false],
  ['patients', '☺', 'Patients', false],
  ['summary', '❐', 'Treatment Summary', false],
  ['procedures', '⚙', 'Procedures & Rates', false],
  ['reports', '📈', 'Reports', true],
  ['doctors', '🩺', 'Doctor Report', true],
  ['settings', '⚒', 'Settings', true],
];

export function Sidebar({ active, onChangePassword, onSignOut }: {
  active: string; onChangePassword: () => void; onSignOut: () => void;
}) {
  const { settings, user, isAdmin } = useSession();
  const logo = safeLogo(settings.logo);

  return (
    <aside id="side">
      <div className="brand" id="brandName">
        {logo && (
          <img src={logo} alt=""
            style={{ width: '100%', maxWidth: 132, display: 'block', margin: '0 auto 8px', background: '#fff', borderRadius: 10, padding: 6 }} />
        )}
        <div style={{ textAlign: 'center' }}>
          {(settings.clinicName || '').replace(/ DENTAL CLINIC/i, '')}
          <small>Dental Billing</small>
        </div>
      </div>

      <nav id="nav">
        {NAVS.filter((n) => !n[3] || isAdmin).map(([r, ic, label]) => (
          <button key={r} data-r={r} className={active === r ? 'on' : ''} onClick={() => navigate(r)}>
            <span className="ic">{ic}</span>{label}
          </button>
        ))}
        <button data-r="__pw" style={{ marginTop: 6, opacity: 0.75 }} onClick={onChangePassword}>
          <span className="ic">🔑</span>Change password
        </button>
        <button data-r="__out" style={{ opacity: 0.75 }} onClick={onSignOut}>
          <span className="ic">⏻</span>Sign out
        </button>
      </nav>

      <div className="foot" id="foot">
        Signed in: <b>{user?.username}</b><br />
        {user?.role === 'admin' ? 'Admin' : 'Staff'} · v3.0
      </div>
    </aside>
  );
}
