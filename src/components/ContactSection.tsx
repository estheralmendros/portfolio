import type { Profile } from '../content/schema';
import { ExternalLink } from './ExternalLink';
import { GitHubIcon, LinkedInIcon, MailIcon } from './icons';

export function ContactSection({ socials }: { socials: Profile['socials'] }) {
  return (
    <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-20 py-12">
      <h2 id="contact-heading" className="section-title">
        Get in touch
      </h2>
      <ul className="mt-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:gap-8">
        <li>
          <a href={`mailto:${socials.email}`} className="link inline-flex items-center gap-2 font-medium">
            <MailIcon />
            {socials.email}
          </a>
        </li>
        <li>
          <ExternalLink href={socials.linkedin} className="link inline-flex items-center gap-2 font-medium">
            <LinkedInIcon />
            LinkedIn ↗
          </ExternalLink>
        </li>
        <li>
          <ExternalLink href={socials.github} className="link inline-flex items-center gap-2 font-medium">
            <GitHubIcon />
            GitHub ↗
          </ExternalLink>
        </li>
      </ul>
    </section>
  );
}
