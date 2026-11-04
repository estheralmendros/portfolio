import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { UPLOAD_PATH_RE, UPLOAD_ROOT, buildUploadPath, isUploadPath, randomShortId, toGlobKey } from '../../src/lib/uploads';

describe('uploads', () => {
  it('UPLOAD_ROOT', () => expect(UPLOAD_ROOT).toBe('src/assets/uploads'));

  it('buildUploadPath has no leading slash and matches the regex', () => {
    const p = buildUploadPath('projects', 'my-app', 'webp', 'a1b2c3');
    expect(p).toBe('src/assets/uploads/projects/my-app-a1b2c3.webp');
    expect(UPLOAD_PATH_RE.test(p)).toBe(true);
    expect(buildUploadPath('profile', 'profile', 'jpg', '000000')).toBe('src/assets/uploads/profile/profile-000000.jpg');
    expect(buildUploadPath('certifications', 'aws-saa', 'png', 'ffffff')).toBe('src/assets/uploads/certifications/aws-saa-ffffff.png');
  });

  it.each([
    'src/assets/uploads/projects/my-app-a1b2c3.webp',
    'src/assets/uploads/profile/profile-000000.jpg',
    'src/assets/uploads/certifications/x-abcdef.png',
  ])('isUploadPath accepts %s', (p) => expect(isUploadPath(p)).toBe(true));

  it.each([
    'src/assets/uploads/projects/my-app-a1b2c3.svg',
    'src/assets/uploads/projects/my-app-a1b2c3.jpeg',
    'src/assets/uploads/projects/My-App-a1b2c3.jpg',
    'src/assets/uploads/projects/my-app-A1B2C3.jpg',
    'src/assets/uploads/projects/my-app-a1b2c.jpg',
    'src/assets/uploads/other/my-app-a1b2c3.jpg',
    '/src/assets/uploads/projects/my-app-a1b2c3.jpg',
    'src/assets/uploads/projects/../x-a1b2c3.jpg',
    'src/assets/uploads/projects/my-app-a1b2c3.jpg?x',
    'src/lib/paths.ts',
    '/images/a.png',
    'https://x.com/a.png',
  ])('isUploadPath rejects %s', (p) => expect(isUploadPath(p)).toBe(false));

  it('toGlobKey makes the path root-absolute', () => {
    expect(toGlobKey('src/assets/uploads/projects/a-000000.jpg')).toBe('/src/assets/uploads/projects/a-000000.jpg');
  });

  it('randomShortId returns 6 lowercase hex chars from the rng', () => {
    const seeded = (bytes: Uint8Array) => {
      bytes.set([0xa1, 0xb2, 0xc3, 0xff].slice(0, bytes.length));
      return bytes;
    };
    expect(randomShortId(seeded)).toBe('a1b2c3');
    expect(randomShortId(() => new Uint8Array([0, 1, 2]))).toBe('000102');
    expect(randomShortId()).toMatch(/^[0-9a-f]{6}$/);
  });

  it('is pure: imports nothing (schema.ts -> parse.ts depend on it)', () => {
    const src = readFileSync('src/lib/uploads.ts', 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/import\.meta/);
  });
});
