import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewPane } from '../../../src/admin/components/PreviewPane';
import { FormLayout } from '../../../src/admin/components/formKit';
import { previewPane } from '../fixtures';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});


describe('PreviewPane', () => {
  it('renders the snapshot inside an inert container labelled "Preview"', () => {
    render(<PreviewPane snapshot={{ title: 'Hello' }} valid render={(s) => <h4>{s.title}</h4>} />);
    expect(previewPane()).toHaveAttribute('inert');
    expect(within(previewPane()).getByText('Hello')).toBeInTheDocument();
    expect(screen.queryByText('Fix errors to save')).toBeNull();
  });

  it('updates 150 ms after the last change (debounce)', () => {
    vi.useFakeTimers();
    const view = (title: string) => <PreviewPane snapshot={{ title }} valid render={(s) => <h4>{s.title}</h4>} />;
    const { rerender } = render(view('A'));
    rerender(view('AB'));
    act(() => vi.advanceTimersByTime(100));
    rerender(view('ABC'));
    act(() => vi.advanceTimersByTime(149));
    expect(within(previewPane()).getByText('A')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(within(previewPane()).getByText('ABC')).toBeInTheDocument();
  });

  it('is aria-busy while a change is debounced, not once it is shown', () => {
    vi.useFakeTimers();
    const view = (title: string, valid = true) => <PreviewPane snapshot={{ title }} valid={valid} render={(s) => <h4>{s.title}</h4>} />;
    const { rerender } = render(view('A'));
    expect(previewPane()).not.toHaveAttribute('aria-busy');
    rerender(view('AB'));
    expect(previewPane()).toHaveAttribute('aria-busy', 'true');
    act(() => vi.advanceTimersByTime(150));
    expect(previewPane()).not.toHaveAttribute('aria-busy');
  });

  it('shows "Fix errors to save" above the preview when invalid (after the debounce too)', () => {
    vi.useFakeTimers();
    const view = (valid: boolean) => <PreviewPane snapshot={{ valid }} valid={valid} render={() => <p>x</p>} />;
    const { rerender } = render(view(true));
    rerender(view(false));
    expect(screen.queryByText('Fix errors to save')).toBeNull();
    act(() => vi.advanceTimersByTime(150));
    const fix = screen.getByText('Fix errors to save');
    expect(previewPane().contains(fix)).toBe(false);
  });

  it('a throwing render shows "Preview unavailable" and recovers on the next snapshot', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = (boom: boolean) => (
      <PreviewPane
        snapshot={{ boom }}
        valid
        render={(s) => {
          if (s.boom) throw new Error('bad');
          return <p>fine</p>;
        }}
      />
    );
    const { rerender } = render(view(true));
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    rerender(view(false));
    act(() => vi.advanceTimersByTime(150));
    expect(within(previewPane()).getByText('fine')).toBeInTheDocument();
    expect(screen.queryByText('Preview unavailable')).toBeNull();
  });

  it('shows an optional note outside the inert container', () => {
    render(<PreviewPane snapshot={{}} valid note="Icons appear after deploy" render={() => <p>x</p>} />);
    const note = screen.getByText('Icons appear after deploy');
    expect(previewPane().contains(note)).toBe(false);
  });
});

describe('FormLayout with a preview', () => {
  it('without aside: no tabs', () => {
    render(<FormLayout>form</FormLayout>);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('below 1024 px: Edit / Preview tabs (hidden at lg), side-by-side grid at lg', async () => {
    render(<FormLayout aside={<p>the preview</p>}>the form</FormLayout>);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveClass('lg:hidden');
    const [edit, preview] = within(tablist).getAllByRole('tab');
    expect(edit).toHaveTextContent('Edit');
    expect(preview).toHaveTextContent('Preview');
    expect(edit).toHaveAttribute('aria-selected', 'true');
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panels).toHaveLength(2);
    const [editPanel, previewPanel] = panels as [HTMLElement, HTMLElement];
    expect(edit).toHaveAttribute('aria-controls', editPanel.id);
    expect(editPanel.parentElement).toHaveClass('lg:grid-cols-2');
    expect(editPanel).toHaveTextContent('the form');
    expect(previewPanel).toHaveTextContent('the preview');
    // Hidden below lg via a class, always visible from lg.
    expect(previewPanel).toHaveClass('hidden', 'lg:block');
    expect(editPanel).not.toHaveClass('hidden');

    await userEvent.click(preview);
    expect(preview).toHaveAttribute('aria-selected', 'true');
    expect(edit).toHaveAttribute('aria-selected', 'false');
    expect(previewPanel).not.toHaveClass('hidden');
    expect(editPanel).toHaveClass('hidden', 'lg:flex');
  });

  it('arrow keys move between the tabs (roving tabindex)', async () => {
    render(<FormLayout aside={<p>p</p>}>f</FormLayout>);
    const [edit, preview] = screen.getAllByRole('tab') as [HTMLElement, HTMLElement];
    expect(edit).toHaveAttribute('tabindex', '0');
    expect(preview).toHaveAttribute('tabindex', '-1');
    edit.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(preview).toHaveFocus();
    expect(preview).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(edit).toHaveFocus();
  });
});
