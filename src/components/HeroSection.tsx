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

const iconLink =
  'inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-fg hover:text-accent';

export function HeroSection({ profile, photo }: { profile: Profile; photo?: ResolvedImage }) {
  const paragraphs = profile.bio.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <section id="about" aria-labelledby="about-heading" className="scroll-mt-20 py-12 sm:py-16">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
        {photo ? (
          <img src={photo.src} alt={profile.name} width={160} height={160} className="h-32 w-32 shrink-0 rounded-full object-cover sm:h-40 sm:w-40" />
        ) : (
          <div aria-hidden="true" className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-accent text-4xl font-bold text-on-accent sm:h-40 sm:w-40">
            {initials(profile.name)}
          </div>
        )}
        <div className="flex flex-col gap-4">
          <div>
            <h1 id="about-heading" className="text-4xl font-bold tracking-tight sm:text-5xl">
              {profile.name}
            </h1>
            <p className="mt-2 text-lg text-muted">
              {profile.title} · {profile.location}
            </p>
          </div>
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
            {AVAILABILITY[profile.availability]}
          </p>
          <div className="flex max-w-prose flex-col gap-3 text-base leading-relaxed">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {profile.cvUrl && (
              <a href={withBase(profile.cvUrl)} download className="btn-primary">
                Download CV
              </a>
            )}
            <a href={`mailto:${profile.socials.email}`} className={iconLink}>
              <MailIcon />
              <span className="sr-only">Email</span>
            </a>
            <ExternalLink href={profile.socials.linkedin} className={iconLink}>
              <LinkedInIcon />
              <span className="sr-only">LinkedIn</span>
            </ExternalLink>
            <ExternalLink href={profile.socials.github} className={iconLink}>
              <GitHubIcon />
              <span className="sr-only">GitHub</span>
            </ExternalLink>
          </div>
        </div>
      </div>
    </section>
  );
}
