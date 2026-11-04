import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const valid = {
  profile: {
    name: 'N', title: 'T', bio: 'B', location: 'L', availability: 'open',
    socials: { email: 'a@b.co', linkedin: 'https://l.com/x', github: 'https://github.com/x' },
  },
  projects: [{ id: 'a', title: 'A', summary: 'S', tags: [], date: '2024-01' }],
  skills: [],
  certifications: [],
  experience: [],
};

describe('parseContent', () => {
  it('returns parsed content with defaults applied', async () => {
    const { parseContent } = await import('../../src/content/parse');
    const c = parseContent(valid);
    expect(c.projects[0]).toMatchObject({ description: '', featured: false });
  });

  it('throws ContentValidationError listing file and path for each issue', async () => {
    const { parseContent, ContentValidationError } = await import('../../src/content/parse');
    const bad = { ...valid, projects: [valid.projects[0], { ...valid.projects[0], id: 'b', date: '2024-1' }], skills: 'x' };
    let err: unknown;
    try {
      parseContent(bad);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ContentValidationError);
    const e = err as InstanceType<typeof ContentValidationError>;
    expect(e.message).toContain('content/projects.json › [1].date: Expected YYYY-MM');
    expect(e.message).toMatch(/content\/skills\.json › \(root\): /);
    expect(e.issues).toContainEqual({ file: 'content/projects.json', path: '[1].date', message: 'Expected YYYY-MM' });
  });

  it('formats nested object paths', async () => {
    const { parseContent } = await import('../../src/content/parse');
    expect(() => parseContent({ ...valid, profile: { ...valid.profile, socials: { ...valid.profile.socials, email: 'x' } } })).toThrow(
      /content\/profile\.json › socials\.email: /,
    );
  });
});

describe('parse.ts has no side effects', () => {
  it('imports only ./schema', () => {
    const src = readFileSync(new URL('../../src/content/parse.ts', import.meta.url), 'utf8');
    const imports = [...src.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(new Set(imports)).toEqual(new Set(['./schema']));
  });

  it('does not evaluate any @content file when imported', async () => {
    vi.resetModules();
    for (const name of ['profile', 'projects', 'skills', 'certifications', 'experience']) {
      vi.doMock(`@content/${name}.json`, () => {
        throw new Error(`loaded ${name}`);
      });
    }
    await expect(import('../../src/content/parse')).resolves.toHaveProperty('parseContent');
    vi.resetModules();
  });
});
