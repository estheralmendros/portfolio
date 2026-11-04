import type { Certification, Experience, Project, Skill } from '../content/schema';
import { NAV_LABELS } from './messages';
import type { ListSection } from './useHashRoute';

/** Per-section copy for headings, buttons and messages; the title is the nav label (one source, review S3b). */
export const SECTION_META: Record<ListSection, { title: string; singular: string; plural: string }> = {
  projects: { title: NAV_LABELS.projects, singular: 'project', plural: 'projects' },
  skills: { title: NAV_LABELS.skills, singular: 'skill', plural: 'skills' },
  certifications: { title: NAV_LABELS.certifications, singular: 'certification', plural: 'certifications' },
  experience: { title: NAV_LABELS.experience, singular: 'experience', plural: 'experience' },
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
