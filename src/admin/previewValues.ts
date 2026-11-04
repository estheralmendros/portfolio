// Best-effort preview values (prd2 Feature 5.2): when a form is invalid the preview still renders from the raw
// values, with "—" for missing required strings. Pure helpers shared by the five forms.
import { PLACEHOLDER } from './messages';

/** The raw string, or "—" when it is blank. */
export const orPlaceholder = (s: string): string => (s.trim() === '' ? PLACEHOLDER : s);

/** formatYearMonth('—-') renders " —", so an invalid month shows as a placeholder instead of "undefined". */
export const DATE_PLACEHOLDER = `${PLACEHOLDER}-`;
export const monthOrPlaceholder = (s: string): string => (/^\d{4}-(0[1-9]|1[0-2])$/.test(s.trim()) ? s.trim() : DATE_PLACEHOLDER);

/** Only https:// links reach the preview (it is inert anyway). */
export const httpsOrUndefined = (s: string): string | undefined => (/^https:\/\/\S+$/i.test(s.trim()) ? s.trim() : undefined);

/** Spreads `{ [key]: value }` only when value is defined (optional = omitted). */
export const opt = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  (value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;
