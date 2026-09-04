import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { proceduresApi, settingsApi } from '@shared/api/endpoints';
import type { Counters, Doctor, Procedure, Settings, User } from '@shared/types';

interface SessionState {
  user: User | null;
  settings: Settings;
  doctors: Doctor[];
  procedures: Procedure[];
  counters: Counters;
}

interface SessionApi extends SessionState {
  isAdmin: boolean;
  activeDoctors: Doctor[];
  /** more than one active doctor => show the per-line doctor column */
  multiDoctor: boolean;
  /** The doctor whose name is printed on EVERY bill, estimate and treatment
   *  summary. Deliberately independent of who treated the patient; falls back to
   *  the first doctor on record so a deleted entry can never leave a bill with a
   *  blank letterhead. */
  billingDoctor: Doctor;
  doctorOf: (id: number | null | undefined) => Doctor;
  setUser: (u: User | null) => void;
  reloadSettings: () => Promise<void>;
  reloadProcedures: () => Promise<void>;
  applySettings: (s: Settings, d: Doctor[], c: Counters) => void;
  setProcedures: (p: Procedure[]) => void;
}

const Ctx = createContext<SessionApi | null>(null);

export function useSession(): SessionApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

export function SessionProvider({ children, initial }: { children: ReactNode; initial: SessionState }) {
  const [state, setState] = useState<SessionState>(initial);

  const setUser = useCallback((user: User | null) => setState((s) => ({ ...s, user })), []);
  const setProcedures = useCallback((procedures: Procedure[]) => setState((s) => ({ ...s, procedures })), []);
  const applySettings = useCallback((settings: Settings, doctors: Doctor[], counters: Counters) =>
    setState((s) => ({ ...s, settings, doctors, counters })), []);

  const reloadSettings = useCallback(async () => {
    const s = await settingsApi.get();
    applySettings(s.settings, s.doctors, s.counters);
  }, [applySettings]);

  const reloadProcedures = useCallback(async () => {
    setProcedures(await proceduresApi.list());
  }, [setProcedures]);

  const value = useMemo<SessionApi>(() => {
    const activeDoctors = state.doctors.filter((d) => d.active !== false);
    const billingDoctor =
      state.doctors.find((d) => d.id === state.settings.defaultDoctorId) || state.doctors[0] || ({ name: '' } as Doctor);
    return {
      ...state,
      isAdmin: state.user?.role === 'admin',
      activeDoctors,
      multiDoctor: activeDoctors.length > 1,
      billingDoctor,
      doctorOf: (id) =>
        state.doctors.find((d) => d.id === id)
        || state.doctors.find((d) => d.id === state.settings.defaultDoctorId)
        || state.doctors[0]
        || ({ name: '' } as Doctor),
      setUser, setProcedures, applySettings, reloadSettings, reloadProcedures,
    };
  }, [state, setUser, setProcedures, applySettings, reloadSettings, reloadProcedures]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
