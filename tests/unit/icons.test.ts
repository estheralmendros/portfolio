import { describe, expect, it, vi } from 'vitest';
import { getSkillIcon } from '../../src/lib/icons';

describe('getSkillIcon', () => {
  it('returns the Simple Icons path and title for a known slug', () => {
    const icon = getSkillIcon('typescript');
    expect(icon?.title).toBe('TypeScript');
    expect(icon?.path).toMatch(/^M/);
    expect(getSkillIcon('githubactions')?.title).toBe('GitHub Actions');
  });
  it('returns null for a missing slug without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getSkillIcon(undefined)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('returns null and logs a build warning for an unknown slug', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getSkillIcon('notarealiconslug')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('notarealiconslug'));
    warn.mockRestore();
  });
});
