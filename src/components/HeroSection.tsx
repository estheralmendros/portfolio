import type { Profile } from '../content/schema';
import type { ResolvedImage } from '../lib/imageResolver';
import { initials } from '../lib/initials';
import { withBase } from '../lib/paths';
import { ExternalLink } from './ExternalLink';
import { GitHubIcon, LinkedInIcon, MailIcon } from './icons';

const AVAILABILITY: Record<Profile['availability'], string> = {
  open: 'Open to opportunities',
  'not-looking': 'Not looking',
  freelance: 'Available for freelance',
};

/** The pill text: the current job replaces "Not looking" when set; every other case uses the availability label. */
export const availabilityLabel = (profile: Pick<Profile, 'availability' | 'currentJob'>): string =>
  profile.availability === 'not-looking' && profile.currentJob
    ? `${profile.currentJob.role} @ ${profile.currentJob.company}`
    : AVAILABILITY[profile.availability];

export function HeroSection({ profile, photo, hasProjects = false }: { profile: Profile; photo?: ResolvedImage; hasProjects?: boolean }) {
  const paragraphs = profile.bio.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <section id="about" aria-labelledby="about-heading" className="hero scroll-mt-24">
      <div className="flex flex-col gap-6">
        <p className="status-pill">
          <span aria-hidden="true" className="status-dot" />
          {availabilityLabel(profile)}
        </p>
        <div>
          <h1 id="about-heading" className="hero-name text-gradient">
            {profile.name}
          </h1>
          <p className="hero-role mt-4">
            {profile.title} · {profile.location}
          </p>
        </div>
        <div className="flex max-w-xl flex-col gap-3 text-base leading-relaxed text-muted sm:text-lg">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {hasProjects && (
            <a href="#projects" className="btn-cta">
              See my work <span aria-hidden="true">→</span>
            </a>
          )}
          {profile.cvUrl && (
            <a href={withBase(profile.cvUrl)} download className="btn-ghost">
              <span aria-hidden="true">↓</span> Download CV
            </a>
          )}
          <span className="flex items-center gap-2 sm:ml-2">
            <a href={`mailto:${profile.socials.email}`} className="icon-btn">
              <MailIcon />
              <span className="sr-only">Email</span>
            </a>
            <ExternalLink href={profile.socials.linkedin} className="icon-btn">
              <LinkedInIcon />
              <span className="sr-only">LinkedIn</span>
            </ExternalLink>
            <ExternalLink href={profile.socials.github} className="icon-btn">
              <GitHubIcon />
              <span className="sr-only">GitHub</span>
            </ExternalLink>
          </span>
        </div>
      </div>
      <div className="avatar-wrap order-first lg:order-none">
        <span aria-hidden="true" className="avatar-ring" />
        <div className="avatar-inner">
          {photo ? (
            <img src={photo.src} alt={profile.name} width={400} height={400} className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true" className="avatar-initials text-gradient">
              {initials(profile.name)}
            </span>
          )}
        </div>
        <span aria-hidden="true" className="avatar-orbit avatar-orbit-a">
          {'{ }'}
        </span>
        <span aria-hidden="true" className="avatar-orbit avatar-orbit-b">
          {'</>'}
        </span>
      </div>
    </section>
  );
}
