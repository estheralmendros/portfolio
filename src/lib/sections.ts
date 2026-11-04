export interface SectionLink {
  id: string;
  label: string;
}

/** Home sections in display order; a section whose list is empty is omitted (and so is its nav link). */
export function visibleSections(lists: {
  projects: readonly unknown[];
  skills: readonly unknown[];
  certifications: readonly unknown[];
  experience: readonly unknown[];
}): SectionLink[] {
  const all: (SectionLink & { show: boolean })[] = [
    { id: 'about', label: 'About', show: true },
    { id: 'projects', label: 'Projects', show: lists.projects.length > 0 },
    { id: 'stack', label: 'Stack', show: lists.skills.length > 0 },
    { id: 'certifications', label: 'Certifications', show: lists.certifications.length > 0 },
    { id: 'journey', label: 'Journey', show: lists.experience.length > 0 },
    { id: 'contact', label: 'Contact', show: true },
  ];
  return all.filter((s) => s.show).map(({ id, label }) => ({ id, label }));
}
