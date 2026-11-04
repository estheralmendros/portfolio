import { afterEach, describe, expect, it } from 'vitest';
import { initNavActive, isCurrentSectionLink } from '../../src/scripts/navActive';

describe('isCurrentSectionLink', () => {
  const home = { pathname: '/portfolio/', hash: '#about' };
  it('same page and same non-empty hash -> current', () => expect(isCurrentSectionLink(home, home)).toBe(true));
  it('different hash -> not current', () => expect(isCurrentSectionLink(home, { pathname: '/portfolio/', hash: '#projects' })).toBe(false));
  it('empty hash never matches', () => expect(isCurrentSectionLink({ pathname: '/portfolio/', hash: '' }, { pathname: '/portfolio/', hash: '' })).toBe(false));
  it('another page with the same hash -> not current', () =>
    expect(isCurrentSectionLink(home, { pathname: '/portfolio/projects/alpha/', hash: '#about' })).toBe(false));
  it('/index.html is the same page as /', () => expect(isCurrentSectionLink(home, { pathname: '/portfolio/index.html', hash: '#about' })).toBe(true));
  it('percent-encoded hashes compare decoded', () =>
    expect(isCurrentSectionLink({ pathname: '/p/', hash: '#caf%C3%A9' }, { pathname: '/p/', hash: '#café' })).toBe(true));
});

describe('initNavActive', () => {
  const header = () => {
    document.body.innerHTML = `
      <header class="site-header">
        <nav aria-label="Sections"><a class="nav-link" href="/#about">About</a><a class="nav-link" href="/#projects">Projects</a></nav>
        <nav aria-label="Sections (mobile)"><a class="nav-link" href="/#about">About</a><a class="nav-link" href="/#projects">Projects</a></nav>
      </header>`;
    return (name: string) => [...document.querySelectorAll<HTMLAnchorElement>('a.nav-link')].filter((a) => a.textContent === name);
  };
  const current = () => [...document.querySelectorAll('a[aria-current="location"]')].map((a) => a.textContent);

  afterEach(() => {
    history.replaceState(null, '', '/');
    document.body.innerHTML = '';
  });

  it('marks the link for the hash in the URL (desktop and mobile), and nothing else', () => {
    history.replaceState(null, '', '/#about');
    const links = header();
    initNavActive(document, window);
    expect(current()).toEqual(['About', 'About']);
    for (const a of links('Projects')) expect(a.hasAttribute('aria-current')).toBe(false);
  });

  it('follows hashchange and clears when the hash is empty', () => {
    history.replaceState(null, '', '/#about');
    header();
    initNavActive(document, window);
    history.replaceState(null, '', '/#projects');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(current()).toEqual(['Projects', 'Projects']);
    history.replaceState(null, '', '/');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(current()).toEqual([]);
  });

  it('marks nothing without a hash', () => {
    header();
    initNavActive(document, window);
    expect(current()).toEqual([]);
  });
});
