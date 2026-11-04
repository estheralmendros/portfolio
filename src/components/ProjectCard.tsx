import type { Project } from '../content/schema';
import { formatYearMonth } from '../lib/dates';
import type { ResolvedImage } from '../lib/imageResolver';
import { withBase } from '../lib/paths';
import { ExternalLink } from './ExternalLink';
import { TagList } from './Tag';

export function ProjectCard({ project, image, hasDetail, featured = false }: { project: Project; image?: ResolvedImage; hasDetail: boolean; featured?: boolean }) {
  return (
    <article className={`glass lift flex h-full flex-col overflow-hidden${featured ? ' featured-card' : ''}`}>
      {image && (
        <img src={image.src} alt={project.imageAlt ?? ''} loading="lazy" decoding="async" className="aspect-video w-full border-b border-line object-cover" />
      )}
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className={`font-bold tracking-tight ${featured ? 'text-xl' : 'text-lg'}`}>{project.title}</h4>
          <time dateTime={project.date} className="date-badge shrink-0">
            {formatYearMonth(project.date)}
          </time>
        </div>
        <p className="leading-relaxed text-muted">{project.summary}</p>
        <TagList tags={project.tags} />
        {(project.repoUrl || project.demoUrl || project.docUrl || hasDetail) && (
          <div className="mt-auto flex flex-wrap gap-5 border-t border-line pt-4 text-sm">
            {project.repoUrl && (
              <ExternalLink href={project.repoUrl} className="card-link">
                Repo <span className="sr-only">for {project.title}</span> <span aria-hidden="true">↗</span>
              </ExternalLink>
            )}
            {project.demoUrl && (
              <ExternalLink href={project.demoUrl} className="card-link">
                Demo <span className="sr-only">for {project.title}</span> <span aria-hidden="true">↗</span>
              </ExternalLink>
            )}
            {project.docUrl && (
              <ExternalLink href={project.docUrl} className="card-link">
                Documentation <span className="sr-only">for {project.title}</span> <span aria-hidden="true">↗</span>
              </ExternalLink>
            )}
            {hasDetail && (
              <a href={withBase(`/projects/${project.id}/`)} className="card-link">
                Read more<span className="sr-only"> about {project.title}</span> →
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
