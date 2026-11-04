// Component-test props come only from tests/fixtures/content (never the real /content).
import profile from '../fixtures/content/profile.json';
import projects from '../fixtures/content/projects.json';
import skills from '../fixtures/content/skills.json';
import certifications from '../fixtures/content/certifications.json';
import experience from '../fixtures/content/experience.json';
import { parseContent } from '../../src/content/parse';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';

export const fixture = parseContent({ profile, projects, skills, certifications, experience });

/** The admin preview region (inert, labelled "Preview"). */
export const previewPane = () => screen.getByLabelText('Preview', { selector: '[inert]' });

/**
 * Stubs URL.createObjectURL / revokeObjectURL (jsdom has neither) by swapping the global URL for a subclass.
 * Restored automatically by vi.unstubAllGlobals() in setup.ts.
 */
export function stubObjectUrls(create: (obj: Blob | MediaSource) => string = () => 'blob:http://localhost/x') {
  const createObjectURL = vi.fn(create);
  const revokeObjectURL = vi.fn((_url: string) => {});
  vi.stubGlobal('URL', class extends URL {
    static override createObjectURL = createObjectURL;
    static override revokeObjectURL = revokeObjectURL;
  });
  return { createObjectURL, revokeObjectURL };
}

/** Stubs window.matchMedia with `impl`; restored automatically by vi.unstubAllGlobals() in setup.ts. */
export function stubMatchMedia(impl: (query: string) => Partial<MediaQueryList>) {
  const matchMedia = vi.fn(impl);
  vi.stubGlobal('matchMedia', matchMedia);
  return matchMedia;
}
