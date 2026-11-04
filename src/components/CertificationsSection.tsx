import type { Certification } from '../content/schema';
import type { ResolvedImage } from '../lib/imageResolver';
import { CertificationCard } from './CertificationCard';

export function CertificationsSection({ certifications, badges, now }: { certifications: Certification[]; badges: Record<string, ResolvedImage | undefined>; now: string }) {
  if (certifications.length === 0) return null;
  return (
    <section id="certifications" aria-labelledby="certifications-heading" className="site-section scroll-mt-24">
      <h2 id="certifications-heading" className="section-title">
        Certifications
      </h2>
      <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {certifications.map((c) => (
          <li key={c.id}>
            <CertificationCard certification={c} badge={badges[c.id]} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}
