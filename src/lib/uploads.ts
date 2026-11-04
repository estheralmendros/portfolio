// Upload path rules shared by the schemas (build + admin) and the image resolver.
// Must stay pure (no imports, no Vite globs, no DOM/Node side effects): schema.ts -> parse.ts import it.

export const UPLOAD_ROOT = 'src/assets/uploads';
export type UploadCollection = 'projects' | 'profile' | 'certifications';
export type UploadExt = 'jpg' | 'png' | 'webp';
export const UPLOAD_PATH_RE = /^src\/assets\/uploads\/(projects|profile|certifications)\/[a-z0-9-]+-[0-9a-f]{6}\.(jpg|png|webp)$/;

export function isUploadPath(ref: string): boolean {
  return UPLOAD_PATH_RE.test(ref);
}

/** `src/assets/uploads/<collection>/<slug>-<shortId>.<ext>` (no leading slash). */
export function buildUploadPath(c: UploadCollection, slug: string, ext: UploadExt, shortId: string): string {
  return `${UPLOAD_ROOT}/${c}/${slug}-${shortId}.${ext}`;
}

/** Vite glob keys are root-absolute: 'src/assets/…' -> '/src/assets/…'. */
export function toGlobKey(uploadPath: string): string {
  return uploadPath.startsWith('/') ? uploadPath : `/${uploadPath}`;
}

/** 6 lowercase hex chars from 3 random bytes (crypto.getRandomValues by default). */
export function randomShortId(
  rng: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => {
    globalThis.crypto.getRandomValues(b);
    return b;
  },
): string {
  const bytes = rng(new Uint8Array(3));
  return Array.from(bytes.slice(0, 3), (b) => b.toString(16).padStart(2, '0')).join('');
}
