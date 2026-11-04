// Live preview (prd2 Feature 5): renders unsaved form values with the public site's presentational components.
// Debounced 150 ms, never throws (error boundary), inert so its links are not focusable or clickable.
import { Component, useEffect, useState, type ReactNode } from 'react';
import { FIX_ERRORS_TO_SAVE, PREVIEW, PREVIEW_UNAVAILABLE } from '../messages';

export const PREVIEW_DEBOUNCE_MS = 150;

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (Object.is(value, shown)) return;
    const t = setTimeout(() => setShown(value), delayMs);
    return () => clearTimeout(t);
  }, [value, shown, delayMs]);
  return shown;
}

class PreviewBoundary extends Component<{ resetKey: unknown; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { resetKey: unknown }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? <p className="text-sm text-muted">{PREVIEW_UNAVAILABLE}</p> : this.props.children;
  }
}

/** Calls `render` during its own render, so a throw is caught by the boundary around it. */
function PreviewContent<T>({ snapshot, render }: { snapshot: T; render: (s: T) => ReactNode }) {
  return <>{render(snapshot)}</>;
}

export function PreviewPane<T>({
  snapshot, valid, render, note, delayMs = PREVIEW_DEBOUNCE_MS,
}: {
  /** Memoize it in the form: a new object restarts the debounce. */
  snapshot: T;
  /** Whether the current values would save; "Fix errors to save" is shown when false. */
  valid: boolean;
  render: (snapshot: T) => ReactNode;
  note?: string;
  delayMs?: number;
}) {
  const shown = useDebouncedValue(snapshot, delayMs);
  const isValid = useDebouncedValue(valid, delayMs);
  // aria-busy while a change waits for the debounce (also lets e2e wait for a settled preview).
  const pending = !Object.is(shown, snapshot) || isValid !== valid;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{PREVIEW}</h2>
      {!isValid && (
        <p className="text-sm font-medium text-danger">
          <span aria-hidden="true">⚠ </span>
          {FIX_ERRORS_TO_SAVE}
        </p>
      )}
      {note && <p className="text-sm text-muted">{note}</p>}
      <div inert role="region" aria-label={PREVIEW} aria-busy={pending || undefined} className="overflow-hidden rounded-lg border border-line bg-bg p-4">
        <PreviewBoundary resetKey={shown}>
          <PreviewContent snapshot={shown} render={render} />
        </PreviewBoundary>
      </div>
    </section>
  );
}
