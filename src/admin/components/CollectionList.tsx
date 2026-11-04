import type { ReactNode } from 'react';
import { NotFoundError, RateLimitError, RemoteContentError, rateLimitMessage } from '../lib/errors';
import { ReorderableList, type ReorderGroup } from './ReorderableList';
import { StatusBanner } from './StatusBanner';

export type ListState<T> = { status: 'loading' } | { status: 'ready'; data: T[]; sha: string } | { status: 'error'; error: Error };

export interface ListHandlers<T> {
  onRetry: () => void;
  onNew: () => void;
  onEdit: (id: string) => void;
  onDelete: (item: T) => void;
  onSaveOrder: (ordered: T[]) => Promise<void>;
  onPendingChange?: (pending: boolean) => void;
}

/** Load-error copy (MVP projects wording, generalized per collection file). */
export function listErrorMessage(error: Error, path = 'content/projects.json', plural = 'projects'): string {
  if (error instanceof RemoteContentError) return `${path} is invalid: ${error.issues.slice(0, 3).join('; ')}`;
  if (error instanceof RateLimitError) return rateLimitMessage(error.resetAt);
  if (error instanceof NotFoundError) return `${path} was not found on main.`;
  return `Couldn't load ${plural}. Check your connection and try again.`;
}

/** Loading / error / ready states of a list screen; the ready state is a ReorderableList with Edit/Delete per row. */
export function CollectionList<T extends { id: string }>({
  state, path, plural, singular, label, renderItem, groups, groupOf, onRetry, onNew, onEdit, onDelete, onSaveOrder, onPendingChange,
}: ListHandlers<T> & {
  state: ListState<T>;
  path: string;
  plural: string;
  singular: string;
  label: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  groups?: ReorderGroup[];
  groupOf?: (item: T) => string;
}) {
  if (state.status === 'loading') return <p role="status">Loading {plural}…</p>;
  if (state.status === 'error') {
    const editable = !(state.error instanceof RemoteContentError);
    return (
      <StatusBanner
        kind="error"
        action={
          editable ? (
            <button type="button" className="btn-secondary" onClick={onRetry}>
              Retry
            </button>
          ) : undefined
        }
      >
        {listErrorMessage(state.error, path, plural)}
      </StatusBanner>
    );
  }
  return (
    <ReorderableList
      items={state.data}
      label={label}
      groups={groups}
      groupOf={groupOf}
      onSaveOrder={onSaveOrder}
      onPendingChange={onPendingChange}
      empty={<p>No {plural} yet.</p>}
      toolbar={({ disabled }) => (
        <button type="button" className="btn-primary" disabled={disabled} onClick={onNew}>
          + New {singular}
        </button>
      )}
      renderItem={renderItem}
      renderActions={(item, { disabled }) => (
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" disabled={disabled} aria-label={`Edit ${label(item)}`} onClick={() => onEdit(item.id)}>
            Edit
          </button>
          <button type="button" className="btn-danger" disabled={disabled} aria-label={`Delete ${label(item)}`} onClick={() => onDelete(item)}>
            Delete
          </button>
        </div>
      )}
    />
  );
}
