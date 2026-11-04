// Component-test props come only from tests/fixtures/content (never the real /content).
import profile from '../fixtures/content/profile.json';
import projects from '../fixtures/content/projects.json';
import skills from '../fixtures/content/skills.json';
import certifications from '../fixtures/content/certifications.json';
import experience from '../fixtures/content/experience.json';
import { parseContent } from '../../src/content/parse';

export const fixture = parseContent({ profile, projects, skills, certifications, experience });
