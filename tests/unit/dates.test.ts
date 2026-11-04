import { describe, expect, it } from 'vitest';
import { currentYearMonth, formatRange, formatYearMonth, isExpired } from '../../src/lib/dates';

describe('dates', () => {
  it('formats YYYY-MM', () => {
    expect(formatYearMonth('2024-03')).toBe('Mar 2024');
    expect(formatYearMonth('2022-12')).toBe('Dec 2022');
  });
  it('formats ranges with Present', () => {
    expect(formatRange('2022-01', null)).toBe('Jan 2022 – Present');
    expect(formatRange('2017-09', '2021-06')).toBe('Sep 2017 – Jun 2021');
  });
  it('isExpired compares to the given month', () => {
    expect(isExpired('2024-02', '2024-03')).toBe(true);
    expect(isExpired('2024-03', '2024-03')).toBe(false);
    expect(isExpired('2027-03', '2024-03')).toBe(false);
    expect(isExpired(undefined, '2024-03')).toBe(false);
  });
  it('currentYearMonth formats a date as YYYY-MM (UTC)', () => {
    expect(currentYearMonth(new Date(Date.UTC(2026, 0, 15)))).toBe('2026-01');
    expect(currentYearMonth()).toMatch(/^\d{4}-\d{2}$/);
  });
});
