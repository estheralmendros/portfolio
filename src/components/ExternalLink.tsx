import type { ReactNode } from 'react';

/** Opens in a new tab, with rel="noopener noreferrer" and visible-to-screen-readers "(opens in new tab)". */
export function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}
