import type { Profile } from '../content/schema';
import { ExternalLink } from './ExternalLink';
import { GitHubIcon, LinkedInIcon, MailIcon } from './icons';

export function ContactSection({ socials }: { socials: Profile['socials'] }) {
  return (
    <section id="contact" aria-labelledby="contact-heading" className="site-section scroll-mt-24">
      <h2 id="contact-heading" className="section-title">
        Get in touch
      </h2>
      <div className="cta-panel mt-10 p-8 sm:p-12">
      <ul className="relative flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <li>
          <a href={`mailto:${socials.email}`} className="btn-cta">
            <MailIcon />
            {socials.email}
          </a>
        </li>
        {/* Always set on the public site (schema); the admin preview blanks a malformed URL (prd2 5.7). */}
        {socials.linkedin && (
          <li>
            <ExternalLink href={socials.linkedin} className="btn-ghost">
              <LinkedInIcon />
              LinkedIn <span aria-hidden="true">↗</span>
            </ExternalLink>
          </li>
        )}
        {socials.github && (
          <li>
            <ExternalLink href={socials.github} className="btn-ghost">
              <GitHubIcon />
              GitHub <span aria-hidden="true">↗</span>
            </ExternalLink>
          </li>
        )}
      </ul>
      </div>
    </section>
  );
}
