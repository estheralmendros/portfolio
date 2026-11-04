// CV PDF upload (prd2 Feature 4): validation and the file changes committed with profile.json.
import { CV_INVALID } from '../messages';
import { CvError } from './errors';
import { blobToBase64 } from './imageProcessing';
import type { FileChange } from './githubClient';

export const MAX_CV_BYTES = 5 * 1024 * 1024;
export const CV_PATH = 'public/uploads/cv.pdf';
const CV_PUBLIC_PATH = '/uploads/cv.pdf';
const PDF_MAGIC = '%PDF-';

/** Throws CvError unless the file is a PDF (type or empty type, review R10), ≤ 5 MB, starting with `%PDF-`. */
export async function validateCv(file: File): Promise<void> {
  if (file.type !== 'application/pdf' && file.type !== '') throw new CvError(CV_INVALID);
  if (file.size > MAX_CV_BYTES || file.size < PDF_MAGIC.length) throw new CvError(CV_INVALID);
  const head = new Uint8Array(await file.slice(0, PDF_MAGIC.length).arrayBuffer());
  if (String.fromCharCode(...head) !== PDF_MAGIC) throw new CvError(CV_INVALID);
}

/** The query defeats CDN/browser caches of the fixed file name. */
export function cvUrlFor(shortId: string): string {
  return `${CV_PUBLIC_PATH}?v=${shortId}`;
}

/** True when cvUrl points to the file this admin uploads (path part `/uploads/cv.pdf`). */
export function isUploadedCvUrl(cvUrl: string | undefined): boolean {
  return cvUrl !== undefined && cvUrl.split(/[?#]/, 1)[0] === CV_PUBLIC_PATH;
}

export async function cvFileChange(file: Blob): Promise<FileChange> {
  return { path: CV_PATH, content: await blobToBase64(file), encoding: 'base64' };
}

export function cvDeleteChange(): FileChange {
  return { path: CV_PATH, delete: true };
}
