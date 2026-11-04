const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2024-03' -> 'Mar 2024' */
export function formatYearMonth(ym: string): string {
  const [year, month] = ym.split('-');
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

/** 'Jan 2022 – Present' */
export function formatRange(start: string, end: string | null): string {
  return `${formatYearMonth(start)} – ${end === null ? 'Present' : formatYearMonth(end)}`;
}

/** True when `expires` is strictly before `now` (both 'YYYY-MM'). */
export function isExpired(expires: string | undefined, now: string): boolean {
  return !!expires && expires < now;
}

/** 'YYYY-MM' for the given date (UTC); the build month by default. */
export function currentYearMonth(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
