import { useCallback, useEffect, useRef, useState } from 'react';
import { DISCARD_CONFIRM } from './messages';

/** List collections with list/new/edit screens. */
export const LIST_SECTIONS = ['projects', 'skills', 'certifications', 'experience'] as const;
export type ListSection = (typeof LIST_SECTIONS)[number];
/** Nav tabs, in header order. */
export type NavSection = 'profile' | ListSection;

export type Route =
  | { name: 'login' }
  | { name: 'profile' }
  | { name: 'list'; section: ListSection }
  | { name: 'new'; section: ListSection }
  | { name: 'edit'; section: ListSection; id: string };

const DEFAULT_ROUTE: Route = { name: 'list', section: 'projects' };
const isListSection = (s: string): s is ListSection => (LIST_SECTIONS as readonly string[]).includes(s);

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Route table (prd2 Feature 1). Unknown hashes fall back to `#/projects`. */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/').slice(1);
  const [head = '', second, ...rest] = parts;
  if (rest.length > 0) return DEFAULT_ROUTE;
  if (second === undefined) {
    if (head === 'login') return { name: 'login' };
    if (head === 'profile') return { name: 'profile' };
    if (isListSection(head)) return { name: 'list', section: head };
    return DEFAULT_ROUTE;
  }
  if (!isListSection(head) || second === '') return DEFAULT_ROUTE;
  if (second === 'new') return { name: 'new', section: head };
  const id = decode(second);
  return id === null ? DEFAULT_ROUTE : { name: 'edit', section: head, id };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'login':
      return '#/login';
    case 'profile':
      return '#/profile';
    case 'list':
      return `#/${route.section}`;
    case 'new':
      return `#/${route.section}/new`;
    case 'edit':
      return `#/${route.section}/${encodeURIComponent(route.id)}`;
  }
}

export function sectionOf(route: Route): NavSection | undefined {
  if (route.name === 'login') return undefined;
  return route.name === 'profile' ? 'profile' : route.section;
}

export type Navigate = (route: Route, opts?: { guard?: boolean }) => boolean;

/**
 * Hash router with a dirty-form guard (review R13). Any hash change made by the user (links, Back) while
 * `isDirty()` asks `confirm("Discard unsaved changes?")`; cancelling restores the previous hash.
 * `navigate(route, { guard: true })` asks the same question for programmatic navigation; it returns false when cancelled.
 */
export function useHashRoute(
  opts: { isDirty?: () => boolean; confirm?: (message: string) => boolean } = {},
): [Route, Navigate] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const current = useRef(window.location.hash);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const allowed = useCallback(() => {
    const { isDirty, confirm = (m: string) => window.confirm(m) } = optsRef.current;
    return !isDirty?.() || confirm(DISCARD_CONFIRM);
  }, []);

  useEffect(() => {
    const onChange = () => {
      const hash = window.location.hash;
      if (hash === current.current) return;
      if (!allowed()) {
        window.history.replaceState(window.history.state, '', current.current || window.location.pathname + window.location.search);
        return;
      }
      const next = parseHash(hash);
      const canonical = routeHash(next);
      if (canonical !== hash) window.history.replaceState(window.history.state, '', canonical);
      current.current = canonical;
      setRoute(next);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [allowed]);

  const navigate = useCallback<Navigate>(
    (next, navOpts) => {
      if (navOpts?.guard && !allowed()) return false;
      const hash = routeHash(next);
      current.current = hash;
      if (window.location.hash !== hash) window.location.hash = hash;
      setRoute(next);
      return true;
    },
    [allowed],
  );
  return [route, navigate];
}

/** Native "leave site?" prompt while there are unsaved changes (review R13). */
export function useBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers only prompt when returnValue is set (deprecated in the DOM typings, hence the cast).
      (e as { returnValue: unknown }).returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}
