import type { Experience } from '../content/schema';
import { TimelineItem } from './TimelineItem';

export function TimelineSection({ experience }: { experience: Experience[] }) {
  if (experience.length === 0) return null;
  return (
    <section id="journey" aria-labelledby="journey-heading" className="site-section scroll-mt-24">
      <h2 id="journey-heading" className="section-title">
        Journey
      </h2>
      <ol className="timeline mt-10 flex flex-col gap-6">
        {experience.map((e) => (
          <TimelineItem key={e.id} entry={e} />
        ))}
      </ol>
    </section>
  );
}
