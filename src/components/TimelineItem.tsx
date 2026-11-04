import type { Experience } from '../content/schema';
import { formatRange } from '../lib/dates';
import { EducationIcon, WorkIcon } from './icons';
import { TagList } from './Tag';

export function TimelineItem({ entry }: { entry: Experience }) {
  return (
    <li className="relative pl-16">
      <span className="timeline-node">
        {entry.type === 'work' ? <WorkIcon /> : <EducationIcon />}
      </span>
      <span className="sr-only">{entry.type === 'work' ? 'Work' : 'Education'}</span>
      <div className="glass lift flex flex-col gap-3 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="text-lg font-bold tracking-tight">
            {entry.role} <span className="font-normal text-muted">— {entry.org}</span>
          </h3>
          <p className="date-badge shrink-0">{formatRange(entry.start, entry.end)}</p>
        </div>
        {entry.location && <p className="text-sm text-muted">{entry.location}</p>}
        {entry.highlights.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-muted marker:text-accent">
            {entry.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        )}
        <TagList tags={entry.tags} label={`Technologies at ${entry.org}`} />
      </div>
    </li>
  );
}
