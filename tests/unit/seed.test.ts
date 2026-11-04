// The ONLY test allowed to load the real /content. It asserts that the files parse, never their values.
import { expect, it } from 'vitest';
import profile from '@content/profile.json';
import projects from '@content/projects.json';
import skills from '@content/skills.json';
import certifications from '@content/certifications.json';
import experience from '@content/experience.json';
import { parseContent } from '../../src/content/parse';

it('seed content in /content passes the schemas', () => {
  expect(() => parseContent({ profile, projects, skills, certifications, experience })).not.toThrow();
});
