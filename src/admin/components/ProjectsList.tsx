import type { Project } from '../../content/schema';
import { formatYearMonth } from '../../lib/dates';
import { CollectionList, type ListHandlers, type ListState as GenericListState } from './CollectionList';

export { listErrorMessage } from './CollectionList';
export type ListState = GenericListState<Project>;

export function ProjectsList({ state, ...handlers }: ListHandlers<Project> & { state: ListState }) {
  return (
    <CollectionList
      state={state}
      section="projects"
      label={(p) => p.title}
      renderItem={(p) => (
        <>
          <span className="font-semibold">{p.title}</span>
          <span className="text-sm text-muted">
            <code>{p.id}</code> · {formatYearMonth(p.date)}
            {p.featured && (
              <>
                {' · '}
                <span aria-hidden="true">★ </span>
                <span>Featured</span>
              </>
            )}
          </span>
        </>
      )}
      {...handlers}
    />
  );
}
