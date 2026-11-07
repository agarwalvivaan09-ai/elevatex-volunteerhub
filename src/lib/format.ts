const dateFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

export const fmtDate = (d: Date | null | undefined) => (d ? dateFmt.format(d) : '—');
export const fmtTime = (d: Date | null | undefined) => (d ? timeFmt.format(d) : '');
export const fmtShort = (d: Date | null | undefined) => (d ? shortFmt.format(d) : '—');
export const fmtDateTime = (d: Date | null | undefined) => (d ? `${dateFmt.format(d)}, ${timeFmt.format(d)}` : '—');
export const monthAbbr = (d: Date) => d.toLocaleString('en-IN', { month: 'short' });

export function fmtRange(start: Date, end: Date | null) {
  if (!end) return fmtDateTime(start);
  if (start.toDateString() === end.toDateString()) return `${fmtDate(start)}, ${fmtTime(start)} – ${fmtTime(end)}`;
  return `${fmtDateTime(start)} – ${fmtDateTime(end)}`;
}

export const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
export const fmtNum = (n: number, digits = 0) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtRs = (n: number) => `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(d: Date | null) {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relativeDay(d: Date) {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(new Date())) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 7) return `In ${days} days`;
  if (days < -1 && days > -7) return `${-days} days ago`;
  return fmtShort(d);
}
