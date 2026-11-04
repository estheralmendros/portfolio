import type { Certification } from '../../content/schema';
import { formatYearMonth } from '../../lib/dates';
import { CollectionList, type ListHandlers, type ListState } from './CollectionList';

export function CertificationsList({ state, ...handlers }: ListHandlers<Certification> & { state: ListState<Certification> }) {
  return (
    <CollectionList
      state={state}
      path="content/certifications.json"
      plural="certifications"
      singular="certification"
      label={(c) => c.name}
      renderItem={(c) => (
        <>
          <span className="font-semibold">{c.name}</span>
          <span className="text-sm text-muted">
            {c.issuer} · {formatYearMonth(c.issued)}
            {c.expires && ` – ${formatYearMonth(c.expires)}`}
          </span>
        </>
      )}
      {...handlers}
    />
  );
}
