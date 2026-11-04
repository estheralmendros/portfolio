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
const bad = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => expect(s.safeParse(v).success).toBe(false);

describe('SlugSchema', () => {
  it('accepts kebab-case', () => ok(SlugSchema, 'abc-123'));
  it.each(['Abc', 'a_b', '-a', 'a-', 'a--b', '', 'a b'])('rejects %j', (v) => bad(SlugSchema, v));
  it('rejects over 60 chars', () => bad(SlugSchema, 'a'.repeat(61)));
  it('accepts 60 chars', () => ok(SlugSchema, 'a'.repeat(60)));
});

describe('YearMonthSchema', () => {
  it.each(['2024-01', '1999-12'])('accepts %s', (v) => ok(YearMonthSchema, v));
  it.each(['2024-13', '2024-00', '2024-1', '24-01', '2024/01', '2024-01-01'])('rejects %s', (v) => bad(YearMonthSchema, v));
  it('uses the Expected YYYY-MM message', () => {
    const r = YearMonthSchema.safeParse('x');
    expect(r.success || r.error.issues[0]?.message).toBe('Expected YYYY-MM');
  });
});

describe('HttpsUrlSchema', () => {
  it('accepts https', () => ok(HttpsUrlSchema, 'https://example.com/x'));
  it.each(['http://example.com', 'ftp://x.com', 'javascript:alert(1)', 'example.com', ''])('rejects %j', (v) =>
    bad(HttpsUrlSchema, v),
  );
  it('says Must start with https://', () => {
    const r = HttpsUrlSchema.safeParse('http://x.com');
    expect(r.success || r.error.issues[0]?.message).toBe('Must start with https://');
  });
});

describe('ImageRefSchema', () => {
  it.each(['https://x.com/a.png', '/images/a.png'])('accepts %s', (v) => ok(ImageRefSchema, v));
  it.each(['images/a.png', 'http://x.com/a.png', '/a b.png', '//evil.com/x.png', ''])('rejects %j', (v) =>
    bad(ImageRefSchema, v),
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
    bad(CvUrlSchema, v),
  );
});

describe('ProfileSchema', () => {
  it('accepts a valid profile', () => ok(ProfileSchema, profile));
  it('rejects an invalid email', () => bad(ProfileSchema, { ...profile, socials: { ...profile.socials, email: 'x' } }));
  it('rejects http linkedin', () =>
    bad(ProfileSchema, { ...profile, socials: { ...profile.socials, linkedin: 'http://linkedin.com' } }));
  it('rejects unknown availability', () => bad(ProfileSchema, { ...profile, availability: 'busy' }));
  it('rejects empty name and over-long bio', () => {
    bad(ProfileSchema, { ...profile, name: '  ' });
    bad(ProfileSchema, { ...profile, bio: 'x'.repeat(1001) });
  });
  it('rejects unknown keys (strict)', () => bad(ProfileSchema, { ...profile, extra: 1 }));
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
  it('rejects http repoUrl', () => bad(ProjectSchema, { ...project, repoUrl: 'http://github.com/x' }));
  it('rejects bad date', () => bad(ProjectSchema, { ...project, date: '2024-3' }));
  it('rejects duplicate tags case-insensitively', () => bad(ProjectSchema, { ...project, tags: ['React', 'react'] }));
  it('rejects more than 12 tags and tags over 30 chars', () => {
    bad(ProjectSchema, { ...project, tags: Array.from({ length: 13 }, (_, i) => `t${i}`) });
    bad(ProjectSchema, { ...project, tags: ['x'.repeat(31)] });
  });
  it('rejects summary over 200 chars', () => bad(ProjectSchema, { ...project, summary: 'x'.repeat(201) }));
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
    bad(SkillSchema, { ...skill, category: 'other' });
    bad(SkillSchema, { ...skill, years: 1.5 });
    bad(SkillSchema, { ...skill, years: 51 });
    bad(SkillSchema, { ...skill, icon: 'Type-Script' });
  });
  it('rejects duplicate skill names case-insensitively', () =>
    bad(SkillsFileSchema, [skill, { ...skill, id: 'ts2', name: 'typescript' }]));
  it('rejects duplicate skill ids', () => bad(SkillsFileSchema, [skill, { ...skill, name: 'Other' }]));
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
  it('rejects http credentialUrl', () => bad(CertificationSchema, { ...cert, credentialUrl: 'http://x.com' }));
  it('rejects duplicate ids', () => bad(CertificationsFileSchema, [cert, cert]));
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
    bad(ExperienceSchema, noEnd);
  });
  it('rejects more than 8 highlights and duplicate tags', () => {
    bad(ExperienceSchema, { ...exp, highlights: Array.from({ length: 9 }, () => 'h') });
    bad(ExperienceSchema, { ...exp, tags: ['A', 'a'] });
  });
  it('rejects duplicate ids', () => bad(ExperienceFileSchema, [exp, exp]));
});
