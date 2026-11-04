import type { DeployState } from '../lib/deployStatus';
import type { NavSection, Route } from '../useHashRoute';
import { AdminNav } from './AdminNav';
import { DeployStatusBadge } from './DeployStatusBadge';

export function AdminHeader({
  section, login, onLogout, nav, deploy,
}: {
  section?: string;
  login?: string;
  onLogout?: () => void;
  nav?: { current?: NavSection; onNavigate: (route: Route) => void };
  deploy?: DeployState;
}) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <p className="font-bold">
            Portfolio admin{section ? <span className="font-normal text-muted"> · {section}</span> : null}
          </p>
          {nav && <AdminNav current={nav.current} onNavigate={nav.onNavigate} />}
        </div>
        {onLogout && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {deploy && <DeployStatusBadge state={deploy} />}
            {login && <span className="text-muted">@{login}</span>}
            <button type="button" className="btn-secondary" onClick={onLogout}>
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
