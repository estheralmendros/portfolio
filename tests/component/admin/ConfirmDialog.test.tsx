import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../../../src/admin/components/ConfirmDialog';

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Delete</button>
      {open && (
        <ConfirmDialog
          title="Delete 'X'?"
          message="Delete 'X'? This commits to main and removes it from the live site."
          confirmLabel="Delete project"
          onConfirm={() => { onConfirm(); setOpen(false); }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

describe('ConfirmDialog', () => {
  it('is an alertdialog that focuses inside and traps focus', async () => {
    render(<Harness onConfirm={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent("This commits to main and removes it from the live site.");
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Delete project' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Delete project' })).toHaveFocus();
  });
  it('Escape cancels and focus returns to the Delete button', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const trigger = screen.getByRole('button', { name: 'Delete' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });
  it('confirm calls onConfirm', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('while busy: Cancel is disabled and Escape is ignored; both work again once idle (review W6)', async () => {
    const onCancel = vi.fn();
    const props = { title: 't', message: 'm', confirmLabel: 'Delete project', onConfirm: vi.fn(), onCancel };
    const { rerender } = render(<ConfirmDialog {...props} busy />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    rerender(<ConfirmDialog {...props} busy={false} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('when the opener is gone after close (deleted row), focus falls back to fallbackFocus (review S8d)', async () => {
    function List() {
      const [rows, setRows] = useState(['a', 'b']);
      const [open, setOpen] = useState<string | null>(null);
      return (
        <>
          <button type="button" id="new-entry">+ New</button>
          {rows.map((r) => (
            <button key={r} type="button" onClick={() => setOpen(r)}>{`Delete ${r}`}</button>
          ))}
          {open && (
            <ConfirmDialog
              title="t"
              message="m"
              confirmLabel="Delete project"
              fallbackFocus={() => document.getElementById('new-entry')}
              onConfirm={() => { setRows((x) => x.filter((y) => y !== open)); setOpen(null); }}
              onCancel={() => setOpen(null)}
            />
          )}
        </>
      );
    }
    render(<List />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete a' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(screen.queryByRole('button', { name: 'Delete a' })).toBeNull();
    expect(screen.getByRole('button', { name: '+ New' })).toHaveFocus();
  });
});
