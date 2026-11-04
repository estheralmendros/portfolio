import { describe, expect, it } from 'vitest';
import {
  CV_PATH, MAX_CV_BYTES, cvDeleteChange, cvFileChange, cvUrlFor, isUploadedCvUrl, validateCv,
} from '../../../src/admin/lib/cvUpload';
import { CvError } from '../../../src/admin/lib/errors';
import { CV_INVALID } from '../../../src/admin/messages';
import { CvUrlSchema } from '../../../src/content/schema';

const PDF_HEADER = '%PDF-1.7\n';
const pdf = (size = 1024, type = 'application/pdf', header = PDF_HEADER) => {
  const bytes = new Uint8Array(Math.max(size, 0));
  bytes.set(new TextEncoder().encode(header).subarray(0, size));
  return new File([bytes], 'cv.pdf', { type });
};

async function cvError(p: Promise<unknown>) {
  const err = await p.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(CvError);
  expect((err as Error).message).toBe(CV_INVALID);
}

describe('constants', () => {
  it('match the PRD', () => {
    expect(MAX_CV_BYTES).toBe(5 * 1024 * 1024);
    expect(CV_PATH).toBe('public/uploads/cv.pdf');
    expect(CV_INVALID).toBe('CV must be a PDF of 5 MB or less');
  });
});

describe('validateCv', () => {
  it('accepts a PDF with %PDF- magic bytes', async () => {
    await expect(validateCv(pdf())).resolves.toBeUndefined();
  });

  it('accepts an empty MIME type and relies on the magic bytes (R10)', async () => {
    await expect(validateCv(pdf(1024, ''))).resolves.toBeUndefined();
    await cvError(validateCv(pdf(1024, '', 'hello world')));
  });

  it('accepts exactly 5 MB and rejects one byte more', async () => {
    await expect(validateCv(pdf(MAX_CV_BYTES))).resolves.toBeUndefined();
    await cvError(validateCv(pdf(MAX_CV_BYTES + 1)));
  });

  it.each(['image/png', 'text/plain', 'application/octet-stream', 'application/x-pdf'])('rejects type %s even with PDF bytes', async (type) => {
    await cvError(validateCv(pdf(1024, type)));
  });

  it.each([
    ['a PNG renamed to .pdf', '\x89PNG\r\n'],
    ['lowercase magic', '%pdf-1.4'],
    ['magic not at offset 0', ' %PDF-1.4'],
    ['truncated magic', '%PDF'],
  ])('rejects %s', async (_l, header) => {
    await cvError(validateCv(pdf(1024, 'application/pdf', header)));
  });

  it('rejects an empty or too-short file', async () => {
    await cvError(validateCv(pdf(0)));
    await cvError(validateCv(pdf(4, 'application/pdf', '%PDF')));
  });
});

describe('cvUrlFor', () => {
  it('builds the versioned public URL accepted by CvUrlSchema', () => {
    expect(cvUrlFor('a1b2c3')).toBe('/uploads/cv.pdf?v=a1b2c3');
    expect(CvUrlSchema.safeParse(cvUrlFor('a1b2c3')).success).toBe(true);
  });
});

describe('isUploadedCvUrl', () => {
  it.each([
    ['/uploads/cv.pdf?v=a1b2c3', true],
    ['/uploads/cv.pdf', true],
    ['https://example.com/uploads/cv.pdf', false],
    ['/docs/cv.pdf', false],
    ['/uploads/cv.pdf.bak', false],
    [undefined, false],
    ['', false],
  ] as const)('%j → %j', (url, expected) => expect(isUploadedCvUrl(url)).toBe(expected));
});

describe('file changes', () => {
  it('cvFileChange writes the PDF bytes as base64 to CV_PATH', async () => {
    const f = pdf(16);
    const bytes = new Uint8Array(await f.arrayBuffer());
    expect(await cvFileChange(f)).toEqual({ path: CV_PATH, content: Buffer.from(bytes).toString('base64'), encoding: 'base64' });
  });
  it('cvDeleteChange deletes CV_PATH', () => expect(cvDeleteChange()).toEqual({ path: CV_PATH, delete: true }));
});
