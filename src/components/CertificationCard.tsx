import type { Certification } from '../content/schema';
import { formatYearMonth, isExpired } from '../lib/dates';
import type { ResolvedImage } from '../lib/imageResolver';
import { ExternalLink } from './ExternalLink';

export function CertificationCard({ certification: c, badge, now }: { certification: Certification; badge?: ResolvedImage; now: string }) {
  const dates = `Issued ${formatYearMonth(c.issued)}${c.expires ? ` · Expires ${formatYearMonth(c.expires)}` : ''}`;
  return (
    <article className="glass lift flex h-full gap-5 p-6">
      {badge && <img src={badge.src} alt={`${c.name} badge`} loading="lazy" decoding="async" width={64} height={64} className="h-16 w-16 shrink-0 rounded-xl bg-surface object-contain p-1" />}
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold tracking-tight">{c.name}</h3>
        <p className="text-muted">{c.issuer}</p>
        <p className="text-sm text-muted">{dates}</p>
        {isExpired(c.expires, now) && (
          <p className="w-fit rounded-full border border-danger px-2 py-0.5 text-xs font-semibold text-danger">Expired</p>
        )}
        {(c.credentialId || c.credentialUrl) && (
          <p className="mt-2 flex flex-wrap items-center gap-4 text-sm">
            {c.credentialId && <span className="font-mono text-xs text-muted">ID {c.credentialId}</span>}
            {c.credentialUrl && (
              <ExternalLink href={c.credentialUrl} className="card-link">
                Verify<span className="sr-only"> {c.name}</span> ↗
              </ExternalLink>
            )}
          </p>
        )}
      </div>
    </article>
  );
}
