import type { MouseEvent } from 'react';
import { NAV_LABELS } from '../messages';
import { routeHash, type NavSection, type Route } from '../useHashRoute';

const ORDER: NavSection[] = ['profile', 'projects', 'skills', 'certifications', 'experience'];
const routeFor = (s: NavSection): Route => (s === 'profile' ? { name: 'profile' } : { name: 'list', section: s });

/** Section tabs. Plain links (no list markup); clicks go through the guarded navigate of AdminApp. */
export function AdminNav({ current, onNavigate }: { current?: NavSection; onNavigate: (route: Route) => void }) {
  const click = (e: MouseEvent<HTMLAnchorElement>, s: NavSection) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(routeFor(s));
  };
  return (
    <nav aria-label="Sections" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {ORDER.map((s) => (
        <a
          key={s}
          href={routeHash(routeFor(s))}
          aria-current={current === s ? 'page' : undefined}
          className={current === s ? 'font-semibold text-fg underline underline-offset-4' : 'text-muted hover:text-fg'}
          onClick={(e) => click(e, s)}
        >
          {NAV_LABELS[s]}
        </a>
      ))}
    </nav>
  );
}
