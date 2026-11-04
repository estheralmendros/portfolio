import { describe, expect, it } from 'vitest';
import { DATE_PLACEHOLDER, httpsOrUndefined, monthOrPlaceholder, opt, orPlaceholder } from '../../../src/admin/previewValues';
import { formatRange, formatYearMonth } from '../../../src/lib/dates';

describe('previewValues', () => {
  it('orPlaceholder: "—" for blank strings only', () => {
    expect(orPlaceholder('')).toBe('—');
    expect(orPlaceholder('  ')).toBe('—');
    expect(orPlaceholder('Hi')).toBe('Hi');
  });

  it('monthOrPlaceholder keeps valid months; the placeholder never renders "undefined"', () => {
    expect(monthOrPlaceholder(' 2024-03 ')).toBe('2024-03');
    for (const bad of ['', '2024-13', '2024', 'abc']) expect(monthOrPlaceholder(bad)).toBe(DATE_PLACEHOLDER);
    expect(formatYearMonth(DATE_PLACEHOLDER).trim()).toBe('—');
    expect(formatRange(DATE_PLACEHOLDER, null)).not.toContain('undefined');
  });

  it('httpsOrUndefined lets only https:// links through', () => {
    expect(httpsOrUndefined(' https://x.com/a ')).toBe('https://x.com/a');
    for (const bad of ['http://x.com', 'javascript:alert(1)', '', 'https://']) expect(httpsOrUndefined(bad)).toBeUndefined();
  });

  it('opt omits undefined values', () => {
    expect(opt('a', undefined)).toEqual({});
    expect(opt('a', 1)).toEqual({ a: 1 });
  });
});
