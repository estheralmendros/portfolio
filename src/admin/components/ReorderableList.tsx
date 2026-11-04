import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { moveEntry } from '../lib/contentStore';
import { DISCARD, ORDER_CHANGED, SAVE_ORDER, SAVING, moveLabel, movedAnnouncement } from '../messages';

export interface ReorderGroup {
  key: string;
  title: string;
}
type Dir = 'up' | 'down';
type Ctx = { disabled: boolean };

const sameOrder = (a: { id: string }[], b: { id: string }[]) => a.length === b.length && a.every((x, i) => x.id === b[i]!.id);

/**
 * prd2 Feature 2: ↑/↓ per row, staged locally (moveEntry), committed once with "Save order".
 * With `groups`/`groupOf`, rows are shown per group and only move within their group (nearest
 * same-group neighbour in the flat array), so the flat order of other groups is unchanged.
 */
export function ReorderableList<T extends { id: string }>({
  items, label, groups, groupOf, renderItem, renderActions, toolbar, onSaveOrder, onPendingChange, empty,
}: {
  items: T[];
  label: (item: T) => string;
  groups?: ReorderGroup[];
  groupOf?: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderActions?: (item: T, ctx: Ctx) => ReactNode;
  toolbar?: (ctx: Ctx) => ReactNode;
  /** Resolves after the commit; the parent then passes the saved list as `items`. A rejection keeps the order pending. */
  onSaveOrder: (ordered: T[]) => Promise<void>;
  onPendingChange?: (pending: boolean) => void;
  empty?: ReactNode;
}) {
  const [base, setBase] = useState(items);
  const [order, setOrder] = useState(items);
  if (base !== items) {
    setBase(items);
    setOrder(items);
  }
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusTarget = useRef<{ id: string; dir: Dir } | null>(null);
  /** The last move: where focus goes when the bar closes (Save order / Discard), review W9. */
  const lastMoved = useRef<{ id: string; dir: Dir } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const requestFocusSave = useRef(false);
  const pending = !sameOrder(order, items);

  const pendingRef = useRef(onPendingChange);
  useEffect(() => {
    pendingRef.current = onPendingChange;
  });
  useEffect(() => {
    pendingRef.current?.(pending);
  }, [pending]);
  useEffect(() => () => pendingRef.current?.(false), []);

  // Runs once the buttons are enabled again (not while saving): the pressed arrow, else its sibling, else the
  // first enabled toolbar button (+ New), so focus never drops to <body>.
  useLayoutEffect(() => {
    const target = focusTarget.current;
    if (!target || saving) return;
    focusTarget.current = null;
    const pressed = buttons.current.get(`${target.id}:${target.dir}`);
    const other = buttons.current.get(`${target.id}:${target.dir === 'up' ? 'down' : 'up'}`);
    const fallback = toolbarRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    const el = [pressed, other].find((b) => b && !b.disabled) ?? fallback;
    el?.focus();
  }, [order, saving]);

  const grouped = groups && groupOf;
  const sameGroup = grouped ? (a: T, b: T) => groupOf(a) === groupOf(b) : () => true;
  const peers = (it: T) => order.filter((x) => sameGroup(x, it));

  const move = (it: T, dir: Dir) => {
    const next = moveEntry(order, it.id, dir, sameGroup);
    const group = next.filter((x) => sameGroup(x, it));
    focusTarget.current = { id: it.id, dir };
    lastMoved.current = { id: it.id, dir };
    setOrder(next);
    setAnnouncement(movedAnnouncement(label(it), group.findIndex((x) => x.id === it.id) + 1, group.length));
  };

  // Ref, not state: a second Enter can arrive before the `saving` re-render.
  const savingRef = useRef(false);
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onSaveOrder(order);
      focusTarget.current = lastMoved.current;
    } catch {
      // The parent shows the error; the order stays pending so the owner can retry or discard.
      requestFocusSave.current = true;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const discard = () => {
    if (savingRef.current) return;
    focusTarget.current = lastMoved.current;
    setOrder(items);
  };

  // After a failed save the bar stays: give focus back to "Save order" once it is enabled again.
  useEffect(() => {
    if (saving || !requestFocusSave.current) return;
    requestFocusSave.current = false;
    saveRef.current?.focus();
  }, [saving]);

  const ctx: Ctx = { disabled: pending || saving };
  const ref = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };

  const row = (it: T) => {
    const list = peers(it);
    const index = list.findIndex((x) => x.id === it.id);
    const name = label(it);
    return (
      <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col">{renderItem(it)}</div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1">
            <button
              ref={ref(`${it.id}:up`)}
              type="button"
              className="btn-secondary px-3"
              aria-label={moveLabel(name, 'up')}
              disabled={saving || index === 0}
              onClick={() => move(it, 'up')}
            >
              <span aria-hidden="true">↑</span>
            </button>
            <button
              ref={ref(`${it.id}:down`)}
              type="button"
              className="btn-secondary px-3"
              aria-label={moveLabel(name, 'down')}
              disabled={saving || index === list.length - 1}
              onClick={() => move(it, 'down')}
            >
              <span aria-hidden="true">↓</span>
            </button>
          </div>
          {renderActions?.(it, ctx)}
        </div>
      </li>
    );
  };
  const ul = (rows: T[]) => <ul className="divide-y divide-line rounded-lg border border-line">{rows.map(row)}</ul>;

  return (
    <div className="flex flex-col gap-4">
      {toolbar && (
        <div ref={toolbarRef} className="flex justify-end">
          {toolbar(ctx)}
        </div>
      )}
      {order.length === 0
        ? empty
        : grouped
          ? groups.map((g) => {
              const rows = order.filter((x) => groupOf(x) === g.key);
              if (rows.length === 0) return null;
              return (
                <section key={g.key} className="flex flex-col gap-2">
                  <h2 className="text-lg font-semibold">{g.title}</h2>
                  {ul(rows)}
                </section>
              );
            })
          : ul(order)}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {pending && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-accent bg-bg px-4 py-3 shadow-lg">
          <p className="font-medium">{ORDER_CHANGED}</p>
          {/* aria-disabled, not `disabled`, while saving: a natively disabled button drops the focus to <body>
              (validation A1-25). The handlers ignore activation while saving. */}
          <div className="flex gap-3">
            <button type="button" className="btn-secondary" aria-disabled={saving || undefined} onClick={discard}>
              {DISCARD}
            </button>
            <button ref={saveRef} type="button" className="btn-primary" aria-disabled={saving || undefined} onClick={() => void save()}>
              {saving ? SAVING : SAVE_ORDER}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
