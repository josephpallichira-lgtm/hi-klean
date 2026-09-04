import { useEffect, useState } from 'react';
import { adminApi, settingsApi, usersApi } from '@shared/api/endpoints';
import { grabFile } from '@shared/api/client';
import { useAsync } from '@shared/hooks/useAsync';
import { safeLogo } from '@shared/lib/text';
import { useSession } from '@/app/session';
import { useModal } from '@shared/ui/Modal';
import { useToast } from '@shared/ui/Toast';
import { Card, Field, PageHead, Scroll } from '@shared/ui/primitives';
import { DoctorsEditor } from './DoctorsEditor';
import { useAddUser, useResetPassword, useAuditLog } from './userDialogs';
import type { Doctor, Settings } from '@shared/types';

export function SettingsPage() {
  const { user, applySettings, settings: live, doctors: liveDocs, counters } = useSession();
  const toast = useToast();
  const modal = useModal();
  const addUser = useAddUser();
  const resetPw = useResetPassword();
  const showAudit = useAuditLog();

  const [set, setSet] = useState<Settings>(live);
  const [docs, setDocs] = useState<Doctor[]>(liveDocs);
  const [deleted, setDeleted] = useState<number[]>([]);
  const [nextBill, setNextBill] = useState(String((counters.bill_no || 168) + 1));
  const [nextReg, setNextReg] = useState(String((counters.reg_no || 12681) + 1));
  const [modesText, setModesText] = useState((live.modes || []).join(', '));

  const usersQ = useAsync(() => usersApi.list(), []);
  useEffect(() => { setSet(live); setDocs(liveDocs); }, [live, liveDocs]);

  const S = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setSet({ ...set, [k]: e.target.value });
  const C = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setSet({ ...set, [k]: e.target.checked });

  async function saveAll() {
    const payload = {
      settings: { ...set, modes: modesText.split(',').map((x) => x.trim()).filter(Boolean) },
      doctors: docs,
      deleteDoctors: deleted,
      counters: {
        bill_no: Math.max(0, (Number(nextBill) || 1) - 1),
        reg_no: Math.max(0, (Number(nextReg) || 1) - 1),
      },
    };
    try {
      await settingsApi.save(payload);
      toast('Settings saved');
      const s2 = await settingsApi.get();
      applySettings(s2.settings, s2.doctors, s2.counters);
      setDeleted([]);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
  }

  function loadLogo(file: File) {
    if (file.size > 900000) return toast('Logo must be under 900 KB', true);
    const r = new FileReader();
    r.onload = () => { setSet((s) => ({ ...s, logo: String(r.result) })); toast('Logo loaded — press Save settings'); };
    r.readAsDataURL(file);
  }

  function importBackup(file: File) {
    const r = new FileReader();
    r.onload = () => {
      let d: { patients?: unknown[]; invoices?: unknown[] };
      try { d = JSON.parse(String(r.result)); } catch { return toast('Not a valid JSON file', true); }
      modal.confirm(
        <>
          Import <b>{(d.patients || []).length} patients</b> and <b>{(d.invoices || []).length} bills</b> from the offline app?
          <br /><br />Existing records are kept — this only adds. Bills whose number already exists are skipped.
        </>,
        async () => {
          try {
            const rep = await adminApi.importBackup(d);
            modal.open({
              title: 'Import finished', wide: true,
              body: (
                <>
                  <p style={{ marginTop: 0 }}>
                    Imported <b>{rep.invoices}</b> bills and <b>{rep.patients}</b> patients.
                    {!!rep.skipped && <><br /><b>{rep.skipped}</b> record(s) were skipped.</>}
                  </p>
                  {!!(rep.skippedBills || []).length && (
                    <p className="sm mut">Bill numbers already present, so not imported again: {rep.skippedBills.join(', ')}</p>
                  )}
                  {!!(rep.collisions || []).length && (
                    <div className="warnbar" style={{ margin: '10px 0 0' }}>
                      <span>
                        <b>Patient ID clashes.</b> These IDs already belonged to a different name, so the imported person
                        was given a fresh ID instead of overwriting anyone:<br />
                        {rep.collisions.map((x, i) => (
                          <span key={i}>{x.reg}: had "{x.existing}", file said "{x.inFile}"<br /></span>
                        ))}
                      </span>
                    </div>
                  )}
                </>
              ),
              footer: <button className="btn p" onClick={modal.close}>Done</button>,
            });
          } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
        }, 'Import');
    };
    r.readAsText(file);
  }

  const logo = safeLogo(set.logo);
  const users = usersQ.data || [];
  const isLocal = typeof window.__DL === 'function';

  return (
    <>
      <PageHead title="Settings" sub="Clinic details, doctors, users, numbering and data"
        actions={<button className="btn p" id="stSave" onClick={saveAll}>Save settings</button>} />

      <Card pad>
        <b>Clinic details (printed on every bill)</b><div className="hr" />
        <div className="row">
          <Field label="Clinic name" style={{ flex: 1, minWidth: 230 }}><input id="st_name" value={set.clinicName || ''} onChange={S('clinicName')} /></Field>
          <Field label="Sub-title (red strip)" style={{ flex: 1, minWidth: 230 }}><input id="st_l2" value={set.line2 || ''} onChange={S('line2')} /></Field>
        </div>
        <div className="row mt">
          <Field label="Address" style={{ flex: 2, minWidth: 240 }}><input id="st_addr" value={set.address || ''} onChange={S('address')} /></Field>
          <Field label="Phone numbers" style={{ flex: 1, minWidth: 190 }}><input id="st_ph" value={set.phone || ''} onChange={S('phone')} /></Field>
        </div>
        <div className="row mt">
          <Field label="Website" style={{ flex: 1, minWidth: 180 }}><input id="st_web" value={set.website || ''} onChange={S('website')} /></Field>
          <Field label="Email" style={{ flex: 1, minWidth: 180 }}><input id="st_mail" value={set.email || ''} onChange={S('email')} /></Field>
          <Field label="GSTIN (blank if not registered)" style={{ width: 190 }}><input id="st_gst" value={set.gstin || ''} onChange={S('gstin')} /></Field>
        </div>
        <div className="row mt" style={{ alignItems: 'center' }}>
          <Field label="Logo" style={{ width: 220 }}>
            <input type="file" id="st_logo" accept="image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadLogo(f); }} />
          </Field>
          <div>
            {logo
              ? <img src={logo} alt="" style={{ height: 54, border: '1px solid var(--line)', borderRadius: 8, padding: 4, background: '#fff' }} />
              : <span className="mut sm">No logo</span>}
          </div>
          <button className="btn sm" id="st_logox"
            onClick={() => { setSet({ ...set, logo: '' }); toast('Logo cleared — press Save settings'); }}>Remove</button>
        </div>
      </Card>

      <Card pad className="mt">
        <b>Doctors</b><div className="hr" />
        <DoctorsEditor doctors={docs} onChange={setDocs} onDelete={(id) => setDeleted((d) => [...d, id])} />
        <div className="row mt">
          <Field style={{ minWidth: 300 }} label="Doctor printed on every bill (letterhead & signature)">
            <select id="st_dd" value={String(set.defaultDoctorId ?? '')}
              onChange={(e) => setSet({ ...set, defaultDoctorId: Number(e.target.value) || null })}>
              {docs.filter((d) => d.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <div className="mut xs" style={{ marginTop: 4 }}>
              This name appears on every bill, estimate and treatment summary, whichever doctor treated the patient.
              The treating doctor is still recorded for the Doctor Report.
            </div>
          </Field>
        </div>
      </Card>

      <Card pad className="mt">
        <b>Users &amp; access</b><div className="hr" />
        <Scroll>
          <table>
            <thead><tr><th>Username</th><th>Name</th><th>Access</th><th>Last login</th><th /></tr></thead>
            <tbody id="usrBody">
              {users.map((u) => (
                <tr key={u.id} data-uid={u.id}>
                  <td className="b">{u.username}{u.id === user?.id && <span className="chip"> you</span>}</td>
                  <td className="mut">{u.full_name || ''}</td>
                  <td>
                    <select data-uf="role" defaultValue={u.role} onChange={async (e) => {
                      try { await usersApi.patch(u.id, { role: e.target.value }); toast('Access updated'); }
                      catch (err) { toast(err instanceof Error ? err.message : String(err), true); usersQ.reload(); }
                    }}>
                      <option value="admin">Admin — everything</option>
                      <option value="staff">Staff — billing only</option>
                    </select>
                  </td>
                  <td className="sm mut">{u.last_login ? new Date(u.last_login).toLocaleString('en-IN') : 'never'}</td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" data-upw={u.id} onClick={() => resetPw(u.id)}>Reset password</button>{' '}
                    <button className={'btn sm' + (u.active ? ' d' : '')} data-uac={u.id} onClick={async () => {
                      try { await usersApi.patch(u.id, { active: !u.active }); toast(!u.active ? 'Enabled' : 'Disabled'); usersQ.reload(); }
                      catch (err) { toast(err instanceof Error ? err.message : String(err), true); }
                    }}>{u.active ? 'Disable' : 'Enable'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
        <button className="btn mt" id="usrAdd" onClick={() => addUser(usersQ.reload)}>＋ Add user</button>
        <p className="sm mut mt" style={{ marginBottom: 0 }}>
          Staff logins cannot open Reports, the Doctor Report or Settings, and cannot change prices, cancel bills or delete
          payments. Every login, price change, edit and cancellation is written to the audit log.
        </p>
      </Card>

      <Card pad className="mt">
        <b>Numbering &amp; printing</b><div className="hr" />
        <div className="row">
          <Field label="Next bill number" style={{ width: 150 }}>
            <input id="st_no" className="num" value={nextBill} onChange={(e) => setNextBill(e.target.value)} />
          </Field>
          <Field label="Patient ID prefix" style={{ width: 140 }}><input id="st_rp" value={set.regPrefix || ''} onChange={S('regPrefix')} /></Field>
          <Field label="Next patient ID" style={{ width: 150 }}>
            <input id="st_rn" className="num" value={nextReg} onChange={(e) => setNextReg(e.target.value)} />
          </Field>
          <Field label="Signature line" style={{ flex: 1, minWidth: 180 }}><input id="st_ft" value={set.footer || ''} onChange={S('footer')} /></Field>
        </div>
        <div className="row mt">
          <label className="switch"><input type="checkbox" id="st_w" checked={!!set.showWords} onChange={C('showWords')} /> Amount in words</label>
          <label className="switch"><input type="checkbox" id="st_sg" checked={!!set.showSign} onChange={C('showSign')} /> Signature block</label>
          <label className="switch"><input type="checkbox" id="st_tm" checked={!!set.showTerms} onChange={C('showTerms')} /> Terms note</label>
          <label className="switch"><input type="checkbox" id="st_gs" checked={!!set.gstEnabled} onChange={C('gstEnabled')} /> Enable GST on new bills</label>
          <div className="mut xs" style={{ marginTop: 5, maxWidth: 520 }}>
            Leave this off unless the clinic is GST-registered. Charging GST without a registration is an offence, and the
            app will not let you switch it on until a valid GSTIN is saved above.
          </div>
        </div>
        <div className="row mt"><Field label="Terms text" style={{ flex: 1 }}><input id="st_tt" value={set.terms || ''} onChange={S('terms')} /></Field></div>
        <div className="row mt">
          <Field label="Payment modes (comma separated)" style={{ flex: 1 }}>
            <input id="st_md" value={modesText} onChange={(e) => setModesText(e.target.value)} />
          </Field>
        </div>
        <p className="sm mut mt" style={{ marginBottom: 0 }}>
          GST: treatment by a clinical establishment is exempt (Notification 12/2017-CT(Rate)). Turning GST on affects
          <b> new</b> bills only — past bills keep the tax state they were saved with. Confirm with your CA first.
        </p>
      </Card>

      <Card pad className="mt">
        <b>Data</b><div className="hr" />
        <div className="row">
          <button className="btn" id="dl" onClick={() => grabFile('/backup', toast)}>⬇ Download database export (JSON)</button>
          <Field label="Import from the offline app's backup" style={{ width: 250 }}>
            <input type="file" id="imp" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); }} />
          </Field>
          <button className="btn" onClick={showAudit}>View audit log</button>
        </div>
        <p className="sm mut mt" style={{ marginBottom: 0 }}>
          {isLocal
            ? 'Everything is stored inside this browser on this computer. Download a backup every evening and keep it on a pen drive or Google Drive — restoring it here brings back every bill, patient and setting.'
            : 'This export is a convenience copy. The real backup is the nightly snapshot on the server — see the README.'}
        </p>
      </Card>
      <div style={{ height: 24 }} />
    </>
  );
}
