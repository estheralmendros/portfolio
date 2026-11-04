import { describe, expect, it } from 'vitest';
import {
  CertificationSchema,
  CertificationsFileSchema,
  CvUrlSchema,
  ExperienceFileSchema,
  ExperienceSchema,
  HttpsUrlSchema,
  ImageRefSchema,
  ProfileSchema,
  ProjectSchema,
  ProjectsFileSchema,
  SkillSchema,
  SkillsFileSchema,
  SlugSchema,
  YearMonthSchema,
} from '../../src/content/schema';

const project = {
  id: 'my-project',
  title: 'My Project',
  summary: 'A summary',
  description: '',
  tags: ['React'],
  featured: false,
  date: '2024-03',
};
const profile = {
  name: 'N',
  title: 'T',
  bio: 'B',
  location: 'L',
  availability: 'open',
  socials: { email: 'a@b.co', linkedin: 'https://linkedin.com/in/x', github: 'https://github.com/x' },
};
const skill = { id: 'ts', name: 'TypeScript', category: 'languages' };
const cert = { id: 'c', name: 'Cert', issuer: 'I', issued: '2024-03' };
const exp = { id: 'e', type: 'work', role: 'R', org: 'O', start: '2022-01', end: null, highlights: [], tags: [] };

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => expect(s.safeParse(v).success).toBe(true);
type Parser = { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[] }[] } } };
/** Rejects `v`; with `expectedPath`, every issue must be reported at exactly that path. */
const bad = (s: Parser, v: unknown, expectedPath?: PropertyKey[]) => {
  const r = s.safeParse(v);
  expect(r.success).toBe(false);
  if (expectedPath) expect(r.error?.issues.map((i) => i.path)).toEqual(r.error?.issues.map(() => expectedPath));
};

describe('SlugSchema', () => {
  it('accepts kebab-case', () => ok(SlugSchema, 'abc-123'));
  it.each(['Abc', 'a_b', '-a', 'a-', 'a--b', '', 'a b'])('rejects %j', (v) => bad(SlugSchema, v, []));
  it('rejects over 60 chars', () => bad(SlugSchema, 'a'.repeat(61), []));
  it('accepts 60 chars', () => ok(SlugSchema, 'a'.repeat(60)));
});

describe('YearMonthSchema', () => {
  it.each(['2024-01', '1999-12'])('accepts %s', (v) => ok(YearMonthSchema, v));
  it.each(['2024-13', '2024-00', '2024-1', '24-01', '2024/01', '2024-01-01'])('rejects %s', (v) => bad(YearMonthSchema, v, []));
  it('uses the Expected YYYY-MM message', () => {
    const r = YearMonthSchema.safeParse('x');
    expect(r.success || r.error.issues[0]?.message).toBe('Expected YYYY-MM');
  });
});

describe('HttpsUrlSchema', () => {
  it('accepts https', () => ok(HttpsUrlSchema, 'https://example.com/x'));
  it.each(['http://example.com', 'ftp://x.com', 'javascript:alert(1)', 'example.com', ''])('rejects %j', (v) =>
    bad(HttpsUrlSchema, v, []),
  );
  it('says Must start with https://', () => {
    const r = HttpsUrlSchema.safeParse('http://x.com');
    expect(r.success || r.error.issues[0]?.message).toBe('Must start with https://');
  });
});

describe('ImageRefSchema', () => {
  it.each(['https://x.com/a.png', '/images/a.png'])('accepts %s', (v) => ok(ImageRefSchema, v));
  it.each(['images/a.png', 'http://x.com/a.png', '/a b.png', '//evil.com/x.png', ''])('rejects %j', (v) =>
    bad(ImageRefSchema, v, []),
  );
  it.each([
    'src/assets/uploads/projects/my-app-a1b2c3.webp',
    'src/assets/uploads/profile/profile-000000.jpg',
    'src/assets/uploads/certifications/aws-ffffff.png',
  ])('accepts upload path %s', (v) => ok(ImageRefSchema, v));
  it.each([
    'src/assets/uploads/projects/my-app-a1b2c3.svg',
    'src/assets/uploads/certifications/badge-a1b2c3.svg',
    'src/assets/uploads/other/x-a1b2c3.jpg',
    'src/assets/uploads/projects/x.jpg',
    'src/lib/paths.ts',
    'src/assets/uploads/projects/my-app-a1b2c3.jpg ',
  ])('rejects non-upload src/ path %j with the MVP message', (v) => {
    const r = ImageRefSchema.safeParse(v);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Use https:// URL or /path');
  });
  it('project image accepts an upload path', () =>
    ok(ProjectSchema, { ...project, image: 'src/assets/uploads/projects/my-project-a1b2c3.jpg', imageAlt: 'alt' }));
});

describe('CvUrlSchema (v2-compatible)', () => {
  it.each(['https://x.com/cv.pdf', '/docs/cv.pdf', '/uploads/cv.pdf?v=a1b2c3'])('accepts %s', (v) => ok(CvUrlSchema, v));
  it.each(['src/assets/uploads/profile/x-a1b2c3.png', '/images/photo.png', '//evil.com/cv.pdf', '/uploads/cv.pdf?v=XYZ', 'cv.pdf'])('rejects %s', (v) =>
    bad(CvUrlSchema, v, []),
  );
});

describe('ProfileSchema', () => {
  it('accepts a valid profile', () => ok(ProfileSchema, profile));
  it('rejects an invalid email', () => bad(ProfileSchema, { ...profile, socials: { ...profile.socials, email: 'x' } }, ['socials', 'email']));
  it('rejects http linkedin', () =>
    bad(ProfileSchema, { ...profile, socials: { ...profile.socials, linkedin: 'http://linkedin.com' } }, ['socials', 'linkedin']));
  it('rejects unknown availability', () => bad(ProfileSchema, { ...profile, availability: 'busy' }, ['availability']));
  it('rejects empty name and over-long bio', () => {
    bad(ProfileSchema, { ...profile, name: '  ' }, ['name']);
    bad(ProfileSchema, { ...profile, bio: 'x'.repeat(1001) }, ['bio']);
  });
  it('rejects unknown keys (strict)', () => bad(ProfileSchema, { ...profile, extra: 1 }, []));
  it('accepts an optional currentJob with role and company', () =>
    ok(ProfileSchema, { ...profile, availability: 'not-looking', currentJob: { role: 'Senior Engineer', company: 'Acme' } }));
  it('accepts currentJob role and company at their maximum lengths (100 / 80)', () =>
    ok(ProfileSchema, { ...profile, currentJob: { role: 'x'.repeat(100), company: 'x'.repeat(80) } }));
  it('rejects a currentJob with an empty role or company, over-long values or unknown keys', () => {
    bad(ProfileSchema, { ...profile, currentJob: { role: '', company: 'Acme' } }, ['currentJob', 'role']);
    bad(ProfileSchema, { ...profile, currentJob: { role: ' ', company: 'Acme' } }, ['currentJob', 'role']);
    bad(ProfileSchema, { ...profile, currentJob: { role: 'Engineer', company: '' } }, ['currentJob', 'company']);
    bad(ProfileSchema, { ...profile, currentJob: { role: 'Engineer', company: '   ' } }, ['currentJob', 'company']);
    bad(ProfileSchema, { ...profile, currentJob: { role: 'Engineer' } }, ['currentJob', 'company']);
    bad(ProfileSchema, { ...profile, currentJob: { company: 'Acme' } }, ['currentJob', 'role']);
    bad(ProfileSchema, { ...profile, currentJob: { role: 'x'.repeat(101), company: 'Acme' } }, ['currentJob', 'role']);
    bad(ProfileSchema, { ...profile, currentJob: { role: 'Engineer', company: 'x'.repeat(81) } }, ['currentJob', 'company']);
    bad(ProfileSchema, { ...profile, currentJob: { role: 'Engineer', company: 'Acme', since: '2024-01' } }, ['currentJob']);
  });
});

describe('ProjectSchema', () => {
  it('accepts a valid project', () => ok(ProjectSchema, project));
  it('defaults description and featured', () => {
    const r = ProjectSchema.parse({ id: 'a', title: 'A', summary: 'S', tags: [], date: '2024-01' });
    expect(r.description).toBe('');
    expect(r.featured).toBe(false);
  });
  it('requires imageAlt when image is set', () => {
    const r = ProjectSchema.safeParse({ ...project, image: '/images/a.png' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['imageAlt']);
    expect(r.error?.issues[0]?.message).toBe('Required when an image is set');
    ok(ProjectSchema, { ...project, image: '/images/a.png', imageAlt: 'Alt' });
  });
  it('reports imageAlt together with other field errors', () => {
    const r = ProjectSchema.safeParse({ ...project, summary: '', image: '/images/a.png' });
    const paths = r.error?.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('summary');
    expect(paths).toContain('imageAlt');
  });
  it('rejects http repoUrl', () => bad(ProjectSchema, { ...project, repoUrl: 'http://github.com/x' }, ['repoUrl']));
  it('accepts an optional https docUrl and rejects http', () => {
    ok(ProjectSchema, { ...project, docUrl: 'https://docs.example.com/x' });
    bad(ProjectSchema, { ...project, docUrl: 'http://docs.example.com/x' }, ['docUrl']);
  });
  it('serializes docUrl right after demoUrl', () => {
    const keys = Object.keys(ProjectSchema.parse({ ...project, repoUrl: 'https://r.x', demoUrl: 'https://d.x', docUrl: 'https://doc.x' }));
    expect(keys.slice(keys.indexOf('repoUrl'), keys.indexOf('repoUrl') + 3)).toEqual(['repoUrl', 'demoUrl', 'docUrl']);
  });
  it('rejects bad date', () => bad(ProjectSchema, { ...project, date: '2024-3' }, ['date']));
  it('rejects duplicate tags case-insensitively', () => bad(ProjectSchema, { ...project, tags: ['React', 'react'] }, ['tags']));
  it('rejects more than 12 tags and tags over 30 chars', () => {
    bad(ProjectSchema, { ...project, tags: Array.from({ length: 13 }, (_, i) => `t${i}`) }, ['tags']);
    bad(ProjectSchema, { ...project, tags: ['x'.repeat(31)] }, ['tags', 0]);
  });
  it('rejects summary over 200 chars', () => bad(ProjectSchema, { ...project, summary: 'x'.repeat(201) }, ['summary']));
});

describe('ProjectsFileSchema', () => {
  it('accepts unique ids', () => ok(ProjectsFileSchema, [project, { ...project, id: 'other' }]));
  it('rejects duplicate ids with a path at [i].id', () => {
    const r = ProjectsFileSchema.safeParse([project, project]);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual([1, 'id']);
    expect(r.error?.issues[0]?.message).toBe('Slug "my-project" is duplicated');
  });
});

describe('SkillSchema', () => {
  it('accepts a valid skill', () => ok(SkillSchema, { ...skill, years: 3, icon: 'typescript' }));
  it('rejects bad category, non-integer years, bad icon', () => {
    bad(SkillSchema, { ...skill, category: 'other' }, ['category']);
    bad(SkillSchema, { ...skill, years: 1.5 }, ['years']);
    bad(SkillSchema, { ...skill, years: 51 }, ['years']);
    bad(SkillSchema, { ...skill, icon: 'Type-Script' }, ['icon']);
  });
  it('accepts mdi:<kebab-name> icons and rejects malformed ones', () => {
    ok(SkillSchema, { ...skill, icon: 'mdi:database' });
    ok(SkillSchema, { ...skill, icon: 'mdi:language-csharp' });
    for (const icon of ['mdi:', 'mdi:Database', 'mdi:-chip', 'mdi:chip-', 'mdi:chip--x', 'fa:database', 'mdi:database outline']) bad(SkillSchema, { ...skill, icon }, ['icon']);
  });
  it('uses friendly messages for icon and years', () => {
    const msg = (v: unknown) => {
      const r = SkillSchema.safeParse(v);
      return r.success ? null : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    };
    expect(msg({ ...skill, icon: 'Type-Script' })).toEqual(['icon: Use a Simple Icons slug (e.g. typescript) or mdi:<name> (e.g. mdi:database)']);
    expect(msg({ ...skill, years: 51 })).toEqual(['years: Must be between 0 and 50']);
    expect(msg({ ...skill, years: -1 })).toEqual(['years: Must be between 0 and 50']);
    expect(msg({ ...skill, years: 1.5 })).toEqual(['years: Use a whole number of years']);
    ok(SkillSchema, { ...skill, years: 0 });
    ok(SkillSchema, { ...skill, years: 50 });
  });
  it('rejects duplicate skill names case-insensitively', () =>
    bad(SkillsFileSchema, [skill, { ...skill, id: 'ts2', name: 'typescript' }], [1, 'name']));
  it('rejects duplicate skill ids', () => bad(SkillsFileSchema, [skill, { ...skill, name: 'Other' }], [1, 'id']));
  it('accepts distinct skills', () => ok(SkillsFileSchema, [skill, { ...skill, id: 'js', name: 'JavaScript' }]));
});

describe('CertificationSchema', () => {
  it('accepts expires >= issued', () => {
    ok(CertificationSchema, { ...cert, expires: '2024-03' });
    ok(CertificationSchema, { ...cert, expires: '2027-03' });
  });
  it('rejects expires < issued', () => {
    const r = CertificationSchema.safeParse({ ...cert, expires: '2023-12' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['expires']);
  });
  it('reports expires < issued together with other field errors (one pass)', () => {
    // A union failure (badge) or a missing field aborts plain refinements unless they use `when`.
    const r = CertificationSchema.safeParse({ ...cert, badge: 'nope', expires: '2023-12' });
    expect(r.error?.issues.map((i) => i.path.join('.')).sort()).toEqual(['badge', 'expires']);
    const { issuer: _issuer, ...noIssuer } = cert;
    const r2 = CertificationSchema.safeParse({ ...noIssuer, expires: '2023-12' });
    expect(r2.error?.issues.map((i) => i.path.join('.')).sort()).toEqual(['expires', 'issuer']);
  });
  it('skips the date-order check while a date itself is invalid', () => {
    const r = CertificationSchema.safeParse({ ...cert, issued: 'x', expires: '2023-12' });
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual(['issued']);
  });
  it('rejects http credentialUrl', () => bad(CertificationSchema, { ...cert, credentialUrl: 'http://x.com' }, ['credentialUrl']));
  it('rejects duplicate ids', () => bad(CertificationsFileSchema, [cert, cert], [1, 'id']));
});

describe('ExperienceSchema', () => {
  it('accepts end null and end >= start', () => {
    ok(ExperienceSchema, exp);
    ok(ExperienceSchema, { ...exp, end: '2022-01' });
  });
  it('rejects end < start', () => {
    const r = ExperienceSchema.safeParse({ ...exp, end: '2021-12' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['end']);
  });
  it('requires end (null, not missing)', () => {
    const { end: _end, ...noEnd } = exp;
    bad(ExperienceSchema, noEnd, ['end']);
    expect(ExperienceSchema.safeParse(noEnd).error?.issues.map((i) => i.path.join('.'))).toEqual(['end']);
  });
  it('reports end < start together with other field errors (one pass)', () => {
    const { org: _org, ...noOrg } = exp;
    const r = ExperienceSchema.safeParse({ ...noOrg, end: '2021-12' });
    expect(r.error?.issues.map((i) => i.path.join('.')).sort()).toEqual(['end', 'org']);
    expect(r.error?.issues.find((i) => i.path[0] === 'end')?.message).toBe('Must be on or after the start date');
  });
  it('skips the date-order check while start is invalid', () => {
    const r = ExperienceSchema.safeParse({ ...exp, start: '2022-13', end: '2021-12' });
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual(['start']);
  });
  it('rejects more than 8 highlights and duplicate tags', () => {
    bad(ExperienceSchema, { ...exp, highlights: Array.from({ length: 9 }, () => 'h') }, ['highlights']);
    bad(ExperienceSchema, { ...exp, tags: ['A', 'a'] }, ['tags']);
  });
  it('rejects duplicate ids', () => bad(ExperienceFileSchema, [exp, exp], [1, 'id']));
});
