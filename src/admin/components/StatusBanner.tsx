import type { ReactNode } from 'react';

export function StatusBanner({ kind, children, action }: { kind: 'success' | 'error'; children: ReactNode; action?: ReactNode }) {
  const tone = kind === 'error' ? 'border-danger text-danger' : 'border-success text-success';
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 bg-bg px-4 py-3 ${tone}`}>
      <p className="font-medium">
        <span aria-hidden="true">{kind === 'error' ? '⚠ ' : '✓ '}</span>
        {children}
      </p>
      {action}
    </div>
  );
}
