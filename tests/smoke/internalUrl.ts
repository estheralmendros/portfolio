const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Smoke definition of an internal URL. Empty, '#…', '//…' and absolute (scheme) values are skipped.
 * Everything else is resolved against the page URL and must stay under /portfolio.
 */
export function isInternalUrlOk(value: string, pageUrl: string): 'ok' | 'fail' | 'skipped' {
  if (value === '' || value.startsWith('#') || value.startsWith('//') || SCHEME_RE.test(value)) return 'skipped';
  const { pathname } = new URL(value, pageUrl);
  return pathname === '/portfolio' || pathname.startsWith('/portfolio/') ? 'ok' : 'fail';
}
