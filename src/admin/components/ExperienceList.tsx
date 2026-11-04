import type { Experience } from '../../content/schema';
import { formatRange } from '../../lib/dates';
import { CollectionList, type ListHandlers, type ListState } from './CollectionList';
import { entryLabel } from '../sections';

const experienceLabel = (e: Experience) => entryLabel('experience', e);

export function ExperienceList({ state, ...handlers }: ListHandlers<Experience> & { state: ListState<Experience> }) {
  return (
    <CollectionList
      state={state}
      section="experience"
      label={experienceLabel}
      renderItem={(e) => (
        <>
          <span className="font-semibold">{experienceLabel(e)}</span>
          <span className="text-sm text-muted">
            {e.type === 'work' ? 'Work' : 'Education'} · {formatRange(e.start, e.end)}
          </span>
        </>
      )}
      {...handlers}
    />
  );
}
