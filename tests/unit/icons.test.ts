import { describe, expect, it, vi } from 'vitest';
import { mdiDatabase, mdiLanguageCsharp } from '@mdi/js';
import { getSkillIcon } from '../../src/lib/icons';

describe('getSkillIcon', () => {
  it('returns the Simple Icons path and title for a known slug', () => {
    const icon = getSkillIcon('typescript');
    expect(icon?.title).toBe('TypeScript');
    expect(icon?.path).toMatch(/^M/);
    expect(getSkillIcon('githubactions')?.title).toBe('GitHub Actions');
  });
  it('resolves mdi:<kebab-name> to the Material Design Icons path', () => {
    const icon = getSkillIcon('mdi:language-csharp');
    expect(icon?.path).toBe(mdiLanguageCsharp);
    expect(icon?.title).toBe('Language Csharp');
    expect(getSkillIcon('mdi:database')?.path).toBe(mdiDatabase);
  });
  it('returns null and warns for an unknown mdi icon', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getSkillIcon('mdi:not-a-real-icon')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('mdi:not-a-real-icon'));
    warn.mockRestore();
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
