import type { Certification, Experience, Project, Skill } from '../content/schema';
import type { ListSection } from './useHashRoute';

/** Per-section copy for headings, buttons and messages. */
export const SECTION_META: Record<ListSection, { title: string; singular: string; plural: string }> = {
  projects: { title: 'Projects', singular: 'project', plural: 'projects' },
  skills: { title: 'Skills', singular: 'skill', plural: 'skills' },
  certifications: { title: 'Certifications', singular: 'certification', plural: 'certifications' },
  experience: { title: 'Experience', singular: 'experience', plural: 'experience' },
};

export interface SectionEntries {
  projects: Project;
  skills: Skill;
  certifications: Certification;
  experience: Experience;
}

/** Commit-message / dialog label (prd2 Feature 1.5): title, name, name, "<role> @ <org>". */
export function entryLabel<S extends ListSection>(section: S, entry: SectionEntries[S]): string {
  switch (section) {
    case 'projects':
      return (entry as Project).title;
    case 'experience': {
      const e = entry as Experience;
      return `${e.role} @ ${e.org}`;
    }
    default:
      return (entry as Skill | Certification).name;
  }
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
