import type { Project } from '../content/schema';

/** A project gets a /projects/<id>/ detail page only when its Markdown description is non-blank. */
export const hasDetailPage = (p: Pick<Project, 'description'>): boolean => p.description.trim() !== '';
