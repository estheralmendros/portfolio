import { useEffect, useId, useRef } from 'react';
import { CANCEL, DELETING } from '../messages';

/**
 * Modal alertdialog: focus trapped, Escape cancels, focus returns to the opener on close — or to `fallbackFocus`
 * when the opener is gone (its row was deleted). While `busy` it can't be cancelled (the delete is committing).
 */
export function ConfirmDialog({
  title, message, confirmLabel, busy = false, onConfirm, onCancel, fallbackFocus,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  fallbackFocus?: () => HTMLElement | null;
}) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  const fallbackRef = useRef(fallbackFocus);
  useEffect(() => {
    onCancelRef.current = onCancel;
    busyRef.current = busy;
    fallbackRef.current = fallbackFocus;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => {
      if (opener && opener.isConnected) opener.focus();
      else fallbackRef.current?.()?.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busyRef.current) onCancelRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const items = [cancelRef.current, confirmRef.current].filter((x): x is HTMLButtonElement => !!x && !x.disabled);
        if (items.length === 0) {
          e.preventDefault(); // busy: nothing to tab to, keep focus on the dialog
          return;
        }
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
        e.preventDefault();
        items[next]!.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Both buttons are disabled while busy; keep focus inside the dialog instead of letting it drop to <body>.
  useEffect(() => {
    if (busy) dialogRef.current?.focus();
  }, [busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-lg border border-line bg-bg p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-muted">
          {message}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button ref={cancelRef} type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            {CANCEL}
          </button>
          <button ref={confirmRef} type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? DELETING : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
