import { useEffect } from 'react';
import { auth } from '@shared/api/endpoints';
import { navigate, useRoute } from './router';
import { useSession } from './session';
import { Sidebar } from './Sidebar';
import { useModal } from '@shared/ui/Modal';
import { Card } from '@shared/ui/primitives';
import { useChangePassword } from '@features/auth/ChangePassword';
import { DashboardPage } from '@features/dashboard/DashboardPage';
import { BillEditorPage, clearHeldDraft, hasUnsavedWork } from '@features/billing';
import { InvoiceListPage } from '@features/invoices';
import { PatientCardPage, PatientListPage } from '@features/patients';
import { TreatmentSummaryPage } from '@features/summary/TreatmentSummaryPage';
import { ProceduresPage } from '@features/procedures/ProceduresPage';
import { ReportsPage } from '@features/reports/ReportsPage';
import { DoctorReportPage } from '@features/doctors/DoctorReportPage';
import { SettingsPage } from '@features/settings/SettingsPage';

const ADMIN_ONLY = ['reports', 'settings', 'doctors'];

export function AppShell() {
  const route = useRoute();
  const { isAdmin } = useSession();
  const modal = useModal();
  const changePassword = useChangePassword();

  // Keyboard shortcuts, unchanged from the original: Alt+N/B/P/D to move around.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !(e.ctrlKey && e.key === 'Enter')) return;
      if (e.altKey && !e.ctrlKey) {
        const k = e.key.toLowerCase();
        if (k === 'n') { e.preventDefault(); clearHeldDraft(); navigate('bill'); }
        if (k === 'b') { e.preventDefault(); navigate('invoices'); }
        if (k === 'p') { e.preventDefault(); navigate('patients'); }
        if (k === 'd') { e.preventDefault(); navigate('dash'); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function signOut() {
    const go = async () => { await auth.logout(); location.reload(); };
    if (hasUnsavedWork()) {
      modal.confirm('You have an unsaved bill open. Sign out and lose it?', go, 'Sign out');
      return;
    }
    await go();
  }

  const blocked = ADMIN_ONLY.includes(route.base) && !isAdmin;

  return (
    <div id="app">
      <Sidebar active={route.base} onChangePassword={() => changePassword(false)} onSignOut={signOut} />
      <main id="main">
        {blocked
          ? <Card className="empty"><div className="big">🔒</div>This section is for admin logins only.</Card>
          : <Screen base={route.base} args={route.args} />}
      </main>
    </div>
  );
}

function Screen({ base, args }: { base: string; args: string[] }) {
  const id = args[0] ? Number(args[0]) : null;
  switch (base) {
    case 'bill': return <BillEditorPage key={id ?? 'new'} editId={id} />;
    case 'invoices': return <InvoiceListPage />;
    case 'patients': return id ? <PatientCardPage id={id} /> : <PatientListPage />;
    case 'summary': return <TreatmentSummaryPage patientId={id} />;
    case 'procedures': return <ProceduresPage />;
    case 'reports': return <ReportsPage />;
    case 'doctors': return <DoctorReportPage />;
    case 'settings': return <SettingsPage />;
    default: return <DashboardPage />;
  }
}
