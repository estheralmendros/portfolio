import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminNav } from '../../../src/admin/components/AdminNav';
import { routeHash, sectionOf, useBeforeUnload, useHashRoute } from '../../../src/admin/useHashRoute';

beforeEach(() => {
  window.history.replaceState(null, '', '#/projects');
});
afterEach(() => vi.restoreAllMocks());

function Harness({ dirty, confirm }: { dirty: boolean; confirm: (m: string) => boolean }) {
  const [route, navigate] = useHashRoute({ isDirty: () => dirty, confirm });
  useBeforeUnload(dirty);
  return (
    <>
      <AdminNav current={sectionOf(route)} onNavigate={(r) => navigate(r, { guard: true })} />
      <p data-testid="route">{routeHash(route)}</p>
    </>
  );
}

const shown = () => screen.getByTestId('route').textContent;

describe('AdminNav', () => {
  it('renders the five tabs in order as links with hashes, marking the current one', () => {
    render(<AdminNav current="skills" onNavigate={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const links = Array.from(nav.querySelectorAll('a'));
    expect(links.map((a) => a.textContent)).toEqual(['Profile', 'Projects', 'Skills', 'Certifications', 'Experience']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#/profile', '#/projects', '#/skills', '#/certifications', '#/experience']);
    expect(screen.getByRole('link', { name: 'Skills' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current');
    expect(nav.querySelector('li')).toBeNull();
  });

  it('clicking a tab navigates to its list route', async () => {
    const onNavigate = vi.fn();
    render(<AdminNav current="projects" onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('link', { name: 'Certifications' }));
    expect(onNavigate).toHaveBeenCalledWith({ name: 'list', section: 'certifications' });
    await userEvent.click(screen.getByRole('link', { name: 'Profile' }));
    expect(onNavigate).toHaveBeenCalledWith({ name: 'profile' });
  });

  it('clean form: switches tabs without asking', async () => {
    const confirm = vi.fn(() => false);
    render(<Harness dirty={false} confirm={confirm} />);
    await userEvent.click(screen.getByRole('link', { name: 'Skills' }));
    expect(shown()).toBe('#/skills');
    expect(window.location.hash).toBe('#/skills');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('dirty form: asks "Discard unsaved changes?"; cancel stays, OK switches', async () => {
    const confirm = vi.fn(() => false);
    const { rerender } = render(<Harness dirty confirm={confirm} />);
    await userEvent.click(screen.getByRole('link', { name: 'Skills' }));
    expect(confirm).toHaveBeenCalledWith('Discard unsaved changes?');
    expect(shown()).toBe('#/projects');
    expect(window.location.hash).toBe('#/projects');
    const ok = vi.fn(() => true);
    rerender(<Harness dirty confirm={ok} />);
    await userEvent.click(screen.getByRole('link', { name: 'Skills' }));
    expect(ok).toHaveBeenCalledOnce();
    expect(shown()).toBe('#/skills');
  });

  it('dirty form: a hash change (Back, typed URL, other link) is confirmed; cancel restores the previous hash', () => {
    const confirm = vi.fn(() => false);
    render(<Harness dirty confirm={confirm} />);
    act(() => {
      window.history.replaceState(null, '', '#/experience');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('#/projects');
    expect(shown()).toBe('#/projects');
  });

  it('a confirmed hash change is not asked twice and unknown routes normalize to #/projects', () => {
    const confirm = vi.fn(() => true);
    render(<Harness dirty confirm={confirm} />);
    act(() => {
      window.history.replaceState(null, '', '#/skills');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(shown()).toBe('#/skills');
    act(() => {
      window.history.replaceState(null, '', '#/nowhere');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(shown()).toBe('#/projects');
    expect(window.location.hash).toBe('#/projects');
  });

  it('beforeunload is blocked only while dirty', () => {
    const { rerender } = render(<Harness dirty confirm={() => true} />);
    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    // Older browsers only show the prompt when returnValue is set (BeforeUnloadEvent's string returnValue).
    let returnValue: unknown = 'untouched';
    Object.defineProperty(dirtyEvent, 'returnValue', { get: () => returnValue, set: (v: unknown) => (returnValue = v) });
    fireEvent(window, dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
    expect(returnValue).toBe('');
    rerender(<Harness dirty={false} confirm={() => true} />);
    const cleanEvent = new Event('beforeunload', { cancelable: true });
    fireEvent(window, cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
  });
});
