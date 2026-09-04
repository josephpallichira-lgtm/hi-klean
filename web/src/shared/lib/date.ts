/** Local (not UTC) yyyy-mm-dd — the clinic bills in IST and a UTC slice
 *  would roll the date over at 05:30 local. */
export const today = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const isoOf = (d: Date): string =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** yyyy-mm-dd -> dd/mm/yyyy */
export const dmy = (iso?: string | null): string => {
  if (!iso) return '';
  const p = String(iso).slice(0, 10).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
};

export const daysAgo = (iso: string): number =>
  Math.max(0, Math.round((+new Date(today()) - +new Date(String(iso).slice(0, 10))) / 86400000));

export const monthStart = (): string => today().slice(0, 8) + '01';

export const weekStart = (): string => {
  const d = new Date();
  const s = new Date(d);
  s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return isoOf(s);
};

/** Indian financial year starts 1 April. */
export const fyStart = (): string => {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return y + '-04-01';
};
