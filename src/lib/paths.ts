import { SITE } from '../config/site';

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** Absolute URL (has a scheme) or protocol-relative `//host`. */
export function isExternalUrl(url: string): boolean {
  return SCHEME_RE.test(url) || url.startsWith('//');
}

/**
 * Prefixes the site base: '/projects/x/' -> '/portfolio/projects/x/'.
 * Absolute URLs are unchanged; paths already under the base are returned as-is (idempotent); no '//' joins.
 */
export function withBase(path: string): string {
  if (SCHEME_RE.test(path)) return path;
  const base = SITE.base;
  if (path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}#`) || path.startsWith(`${base}?`)) {
    return path;
  }
  const trimmed = path.replace(/^\/+/, '');
  return `${base}/${trimmed}`;
}
