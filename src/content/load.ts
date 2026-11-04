// Side effect: parses the real content (or CONTENT_DIR fixtures) when imported. Build-time only.
import profile from '@content/profile.json';
import projects from '@content/projects.json';
import skills from '@content/skills.json';
import certifications from '@content/certifications.json';
import experience from '@content/experience.json';
import { parseContent } from './parse';
import type { SiteContent } from './schema';

export const content: SiteContent = parseContent({ profile, projects, skills, certifications, experience });
