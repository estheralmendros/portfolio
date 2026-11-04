import type { Experience } from '../content/schema';
import { formatRange } from '../lib/dates';
import { EducationIcon, WorkIcon } from './icons';
import { TagList } from './Tag';

export function TimelineItem({ entry }: { entry: Experience }) {
  return (
    <li className="relative border-l-2 border-line pb-8 pl-8 last:pb-0">
      <span className="absolute -left-[17px] top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-line bg-bg text-accent">
        {entry.type === 'work' ? <WorkIcon /> : <EducationIcon />}
      </span>
      <span className="sr-only">{entry.type === 'work' ? 'Work' : 'Education'}</span>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h3 className="font-semibold">
            {entry.role} <span className="font-normal text-muted">— {entry.org}</span>
          </h3>
          <p className="shrink-0 text-sm text-muted">{formatRange(entry.start, entry.end)}</p>
        </div>
        {entry.location && <p className="text-sm text-muted">{entry.location}</p>}
        {entry.highlights.length > 0 && (
          <ul className="list-disc space-y-1 pl-5">
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
