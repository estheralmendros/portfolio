import { describe, expect, it } from 'vitest';
import { resolvePreviewImage } from '../../../src/admin/lib/previewImage';
import { SITE } from '../../../src/config/site';

const UP = 'src/assets/uploads/projects/app-a1b2c3.webp';
const RAW = `https://raw.githubusercontent.com/${SITE.owner}/${SITE.repo}`;

describe('resolvePreviewImage', () => {
  it('a new upload (object URL) wins over any ref', () => {
    expect(resolvePreviewImage(UP, { objectUrl: 'blob:http://x/1', commitRef: 'abc' })).toEqual({ src: 'blob:http://x/1' });
    expect(resolvePreviewImage(undefined, { objectUrl: 'blob:http://x/2' })).toEqual({ src: 'blob:http://x/2' });
  });
  it('an upload path → raw.githubusercontent.com at the last commit of this tab', () =>
    expect(resolvePreviewImage(UP, { commitRef: 'abc123' })).toEqual({ src: `${RAW}/abc123/${UP}` }));
  it('falls back to main without a commitRef', () => {
    expect(resolvePreviewImage(UP)).toEqual({ src: `${RAW}/main/${UP}` });
    expect(`${RAW}/main/`).toBe('https://raw.githubusercontent.com/estheralmendros/portfolio/main/');
  });
  it('/path → withBase; https → as-is', () => {
    expect(resolvePreviewImage('/images/a.png')).toEqual({ src: '/portfolio/images/a.png' });
    expect(resolvePreviewImage('https://example.com/a.png', { commitRef: 'x' })).toEqual({ src: 'https://example.com/a.png' });
  });
  it.each([undefined, '', '   ', 'src/assets/uploads/projects/x.svg', 'nope', 'http://insecure/a.png', '//evil.com/a.png'])(
    'nothing to show for %j',
    (ref) => expect(resolvePreviewImage(ref)).toBeUndefined(),
  );
});
