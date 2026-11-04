import type { ReactNode } from 'react';
import { SITE, SITE_URL } from '../../config/site';
import { ExternalLink } from '../../components/ExternalLink';
import type { DeployState } from '../lib/deployStatus';
import { DEPLOY } from '../messages';

const ACTIONS_URL = `https://github.com/${SITE.owner}/${SITE.repo}/actions`;

/** prd2 Feature 7: always-present polite status region; state is shown by icon + text (+ colour). */
export function DeployStatusBadge({ state }: { state: DeployState }) {
  return (
    <div role="status" className="text-sm">
      {content(state)}
    </div>
  );
}

function Pill({ icon, tone, children }: { icon: string; tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border-2 px-3 py-1 font-medium ${tone}`}>
      <span aria-hidden="true">{icon}</span>
      {children}
    </span>
  );
}

function content(state: DeployState) {
  switch (state.kind) {
    case 'idle':
      return null;
    case 'deploying':
      return (
        <Pill icon="⟳" tone="border-line-strong text-fg">
          <span>{DEPLOY.deploying}</span>
        </Pill>
      );
    case 'live':
      return (
        <Pill icon="✓" tone="border-success text-success">
          <span>{DEPLOY.live}</span>
          <span aria-hidden="true">·</span>
          <ExternalLink href={`${SITE_URL}/`} className="link">
            {DEPLOY.viewSite} <span aria-hidden="true">↗</span>
          </ExternalLink>
        </Pill>
      );
    case 'failed':
      return (
        <Pill icon="✕" tone="border-danger text-danger">
          <span>{DEPLOY.failed}</span>
          <span aria-hidden="true">·</span>
          <ExternalLink href={state.runUrl} className="link">
            {DEPLOY.viewRun} <span aria-hidden="true">↗</span>
          </ExternalLink>
        </Pill>
      );
    case 'superseded':
      return (
        <Pill icon="↷" tone="border-line-strong text-fg">
          <span>{DEPLOY.superseded}</span>
          <span aria-hidden="true">·</span> <ActionsLink />
        </Pill>
      );
    case 'unknown':
      return (
        <Pill icon="?" tone="border-line-strong text-fg">
          <span>{DEPLOY.unknown}</span>
          <span aria-hidden="true">·</span> <ActionsLink />
          {state.reason === 'forbidden' && <span className="text-muted">{DEPLOY.forbiddenHint}</span>}
        </Pill>
      );
  }
}

function ActionsLink() {
  return (
    <ExternalLink href={ACTIONS_URL} className="link">
      {DEPLOY.openActions} <span aria-hidden="true">↗</span>
    </ExternalLink>
  );
}
