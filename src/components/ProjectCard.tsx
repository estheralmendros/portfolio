import type { Project } from '../content/schema';
import { formatYearMonth } from '../lib/dates';
import type { ResolvedImage } from '../lib/imageResolver';
import { withBase } from '../lib/paths';
import { ExternalLink } from './ExternalLink';
import { TagList } from './Tag';

export function ProjectCard({ project, image, hasDetail }: { project: Project; image?: ResolvedImage; hasDetail: boolean }) {
  return (
    <article className="card flex h-full flex-col overflow-hidden">
      {image && (
        <img src={image.src} alt={project.imageAlt ?? ''} loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-lg font-semibold">{project.title}</h4>
          <time dateTime={project.date} className="shrink-0 text-sm text-muted">
            {formatYearMonth(project.date)}
          </time>
        </div>
        <p className="text-muted">{project.summary}</p>
        <TagList tags={project.tags} />
        {(project.repoUrl || project.demoUrl || hasDetail) && (
          <div className="mt-auto flex flex-wrap gap-4 pt-2 text-sm font-medium">
            {project.repoUrl && (
              <ExternalLink href={project.repoUrl} className="link">
                Repo ↗
              </ExternalLink>
            )}
            {project.demoUrl && (
              <ExternalLink href={project.demoUrl} className="link">
                Demo ↗
              </ExternalLink>
            )}
            {hasDetail && (
              <a href={withBase(`/projects/${project.id}/`)} className="link">
                Read more<span className="sr-only"> about {project.title}</span> →
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
