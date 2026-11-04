import type { Project } from '../content/schema';
import { formatYearMonth } from '../lib/dates';
import type { ResolvedImage } from '../lib/imageResolver';
import { withBase } from '../lib/paths';
import { ExternalLink } from './ExternalLink';
import { TagList } from './Tag';

/** `html` must come from renderMarkdown (raw HTML escaped, URLs protocol-filtered). */
export function ProjectDetail({ project, image, html }: { project: Project; image?: ResolvedImage; html: string }) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 py-10">
      <a href={withBase('/#projects')} className="link w-fit text-sm font-medium">
        ← All projects
      </a>
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{project.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <time dateTime={project.date}>{formatYearMonth(project.date)}</time>
          <TagList tags={project.tags} />
        </div>
      </header>
      {image && <img src={image.src} alt={project.imageAlt ?? ''} decoding="async" className="aspect-video w-full rounded-lg object-cover" />}
      {(project.repoUrl || project.demoUrl) && (
        <div className="flex flex-wrap gap-3">
          {project.repoUrl && (
            <ExternalLink href={project.repoUrl} className="btn-primary">
              View repository ↗
            </ExternalLink>
          )}
          {project.demoUrl && (
            <ExternalLink href={project.demoUrl} className="btn-secondary">
              Live demo ↗
            </ExternalLink>
          )}
        </div>
      )}
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
