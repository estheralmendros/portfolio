import type { Project } from '../content/schema';
import type { ResolvedImage } from '../lib/imageResolver';
import { collectTags, encodeTags } from '../lib/projectFilter';
import { ProjectCard } from './ProjectCard';
import { ProjectFilter } from './ProjectFilter';

export const hasDetailPage = (p: Project): boolean => p.description.trim() !== '';

function Group({ id, group, title, projects, images, cols }: { id: string; group: 'featured' | 'more'; title: string; projects: Project[]; images: Record<string, ResolvedImage | undefined>; cols: string }) {
  if (projects.length === 0) return null;
  return (
    <section aria-labelledby={id} data-project-group={group} className="mt-8">
      <h3 id={id} className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
        {title}
      </h3>
      <ul className={`grid grid-cols-1 gap-6 ${cols}`}>
        {projects.map((p) => (
          <li key={p.id} data-project-card data-tags={encodeTags(p.tags)}>
            <ProjectCard project={p} image={images[p.id]} hasDetail={hasDetailPage(p)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProjectsSection({ projects, images }: { projects: Project[]; images: Record<string, ResolvedImage | undefined> }) {
  if (projects.length === 0) return null;
  const featured = projects.filter((p) => p.featured);
  const rest = projects.filter((p) => !p.featured);
  return (
    <section id="projects" aria-labelledby="projects-heading" className="scroll-mt-20 py-12">
      <h2 id="projects-heading" className="section-title">
        Projects
      </h2>
      <ProjectFilter tags={collectTags(projects)} />
      <p className="sr-only" aria-live="polite" data-project-filter-status></p>
      <Group id="projects-featured" group="featured" title="Featured" projects={featured} images={images} cols="sm:grid-cols-2" />
      <Group id="projects-more" group="more" title="More projects" projects={rest} images={images} cols="sm:grid-cols-2 lg:grid-cols-3" />
    </section>
  );
}
