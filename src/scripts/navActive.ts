// Header nav: marks the link for the section named in the URL hash (prd.md Feature 2 addendum).
// Progressive enhancement, bundled external module (no inline script).

interface Place {
  pathname: string;
  hash: string;
}

const page = (pathname: string) => pathname.replace(/index\.html$/, '');
const fragment = (hash: string) => {
  try {
    return decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return hash.replace(/^#/, '');
  }
};

/** True when the link targets a non-empty fragment on the current page and it is the one in the URL. */
export function isCurrentSectionLink(link: Place, loc: Place): boolean {
  const id = fragment(link.hash);
  return id !== '' && id === fragment(loc.hash) && page(link.pathname) === page(loc.pathname);
}

export function initNavActive(doc: Document, win: Window): void {
  const links = [...doc.querySelectorAll<HTMLAnchorElement>('.site-header a.nav-link')];
  const apply = () => {
    for (const a of links) {
      if (isCurrentSectionLink(a, win.location)) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
  };
  apply();
  win.addEventListener('hashchange', apply);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && !import.meta.env?.VITEST) {
  initNavActive(document, window);
}
