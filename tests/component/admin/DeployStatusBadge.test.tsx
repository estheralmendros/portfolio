import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeployStatusBadge } from '../../../src/admin/components/DeployStatusBadge';
import type { DeployState } from '../../../src/admin/lib/deployStatus';

const ACTIONS = 'https://github.com/estheralmendros/portfolio/actions';
const RUN = 'https://github.com/estheralmendros/portfolio/actions/runs/7';

function badge(state: DeployState) {
  render(<DeployStatusBadge state={state} />);
  return screen.getByRole('status');
}

describe('DeployStatusBadge', () => {
  it('idle: an empty polite status region (so later updates are announced)', () => {
    const el = badge({ kind: 'idle' });
    expect(el).toHaveTextContent('');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('deploying', () => {
    const el = badge({ kind: 'deploying' });
    expect(el).toHaveTextContent('Deploying…');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('live links to the site', () => {
    const el = badge({ kind: 'live' });
    expect(el).toHaveTextContent('Live');
    const link = screen.getByRole('link', { name: /View site/ });
    expect(link).toHaveAttribute('href', 'https://estheralmendros.github.io/portfolio/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('failed links to the run (html_url)', () => {
    const el = badge({ kind: 'failed', runUrl: RUN });
    expect(el).toHaveTextContent('Failed');
    expect(screen.getByRole('link', { name: /View run/ })).toHaveAttribute('href', RUN);
  });

  it('superseded: "Replaced by a newer deploy" + Open Actions, never "Failed"', () => {
    const el = badge({ kind: 'superseded', runUrl: RUN });
    expect(el).toHaveTextContent('Replaced by a newer deploy');
    expect(el).not.toHaveTextContent('Failed');
    expect(screen.getByRole('link', { name: /Open Actions/ })).toHaveAttribute('href', ACTIONS);
  });

  it.each(['timeout', 'unexpected'] as const)('unknown (%s): Status unknown + Open Actions, no token hint', (reason) => {
    const el = badge({ kind: 'unknown', reason });
    expect(el).toHaveTextContent('Status unknown');
    expect(screen.getByRole('link', { name: /Open Actions/ })).toHaveAttribute('href', ACTIONS);
    expect(el).not.toHaveTextContent('Add Actions: Read to your token');
  });

  it('unknown (forbidden) adds the token hint', () => {
    const el = badge({ kind: 'unknown', reason: 'forbidden' });
    expect(el).toHaveTextContent('Status unknown');
    expect(el).toHaveTextContent('Add Actions: Read to your token');
  });

  it('conveys state with an icon hidden from assistive tech, not colour alone', () => {
    const el = badge({ kind: 'failed', runUrl: RUN });
    const icon = el.querySelector('[aria-hidden="true"]');
    expect(icon?.textContent).toBe('✕');
  });
});
