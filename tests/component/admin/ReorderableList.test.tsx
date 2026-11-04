import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ReorderableList } from '../../../src/admin/components/ReorderableList';

interface Item { id: string; name: string; group: string }
const item = (id: string, group = 'g'): Item => ({ id, name: id.toUpperCase(), group });

function setup(opts: { items?: Item[]; grouped?: boolean; onSaveOrder?: (items: Item[]) => Promise<void> } = {}) {
  const onPendingChange = vi.fn();
  const saved: Item[][] = [];
  function Host() {
    const [items, setItems] = useState(opts.items ?? [item('a'), item('b'), item('c')]);
    return (
      <ReorderableList
        items={items}
        label={(i) => i.name}
        groups={opts.grouped ? [{ key: 'x', title: 'Group X' }, { key: 'y', title: 'Group Y' }] : undefined}
        groupOf={opts.grouped ? (i) => i.group : undefined}
        toolbar={({ disabled }) => <button type="button" disabled={disabled}>+ New</button>}
        renderItem={(i) => <span>{i.name}</span>}
        renderActions={(i, { disabled }) => <button type="button" disabled={disabled} aria-label={`Edit ${i.name}`}>Edit</button>}
        onPendingChange={onPendingChange}
        onSaveOrder={async (next) => {
          saved.push(next);
          if (opts.onSaveOrder) await opts.onSaveOrder(next);
          setItems(next);
        }}
      />
    );
  }
  render(<Host />);
  return { onPendingChange, saved };
}

const names = () => screen.getAllByRole('listitem').map((li) => li.querySelector('span')!.textContent);
const up = (n: string) => screen.getByRole('button', { name: `Move '${n}' up` });
const down = (n: string) => screen.getByRole('button', { name: `Move '${n}' down` });

describe('ReorderableList', () => {
  it('renders ↑/↓ buttons with aria-labels; ↑ disabled on the first row and ↓ on the last', () => {
    setup();
    expect(names()).toEqual(['A', 'B', 'C']);
    expect(up('A')).toBeDisabled();
    expect(down('A')).toBeEnabled();
    expect(up('C')).toBeEnabled();
    expect(down('C')).toBeDisabled();
    expect(up('A').tagName).toBe('BUTTON');
    expect(screen.queryByText(/Order changed/)).toBeNull();
  });

  it('a move is local: reorders, keeps focus on the same button, announces the position and shows the sticky bar', async () => {
    const { onPendingChange, saved } = setup();
    await userEvent.click(down('A'));
    expect(names()).toEqual(['B', 'A', 'C']);
    expect(down('A')).toHaveFocus();
    expect(screen.getByText("Moved 'A' to position 2 of 3")).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Order changed —')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save order' })).toBeEnabled();
    expect(onPendingChange).toHaveBeenLastCalledWith(true);
    expect(saved).toEqual([]);
  });

  it('while the order is pending, Edit/Delete/New are disabled', async () => {
    setup();
    expect(screen.getByRole('button', { name: '+ New' })).toBeEnabled();
    await userEvent.click(down('B'));
    expect(screen.getByRole('button', { name: '+ New' })).toBeDisabled();
    for (const n of ['A', 'B', 'C']) expect(screen.getByRole('button', { name: `Edit ${n}` })).toBeDisabled();
  });

  it('focus moves to the enabled sibling when the pressed button became disabled', async () => {
    setup();
    await userEvent.click(down('B'));
    expect(names()).toEqual(['A', 'C', 'B']);
    expect(down('B')).toBeDisabled();
    expect(up('B')).toHaveFocus();
    await userEvent.click(up('C'));
    expect(names()).toEqual(['C', 'A', 'B']);
    expect(down('C')).toHaveFocus();
  });

  it('works from the keyboard', async () => {
    setup();
    down('A').focus();
    await userEvent.keyboard('{Enter}');
    expect(names()).toEqual(['B', 'A', 'C']);
    await userEvent.keyboard(' ');
    expect(names()).toEqual(['B', 'C', 'A']);
    expect(up('A')).toHaveFocus();
  });

  it('Discard restores the loaded order and hides the bar', async () => {
    const { onPendingChange } = setup();
    await userEvent.click(down('A'));
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(names()).toEqual(['A', 'B', 'C']);
    expect(screen.queryByText('Order changed —')).toBeNull();
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: '+ New' })).toBeEnabled();
  });

  it('moving back to the loaded order hides the bar', async () => {
    setup();
    await userEvent.click(down('A'));
    await userEvent.click(up('A'));
    expect(screen.queryByText('Order changed —')).toBeNull();
  });

  it('Save order passes the new order; everything is disabled while saving; the bar goes when the list reloads', async () => {
    let release!: () => void;
    const { saved } = setup({ onSaveOrder: () => new Promise<void>((r) => { release = r; }) });
    await userEvent.click(down('A'));
    await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
    expect(saved).toEqual([[item('b'), item('a'), item('c')]]);
    // The bar buttons stay focusable (aria-disabled, not `disabled`) so focus never drops to <body> (A1-25).
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveAttribute('aria-disabled', 'true');
    expect(up('A')).toBeDisabled();
    expect(down('A')).toBeDisabled();
    release();
    await screen.findByRole('button', { name: '+ New' });
    await vi.waitFor(() => expect(screen.queryByText('Order changed —')).toBeNull());
    expect(names()).toEqual(['B', 'A', 'C']);
  });

  it('a failed save keeps the pending order and re-enables the bar', async () => {
    setup({ onSaveOrder: async () => { throw new Error('nope'); } });
    await userEvent.click(down('A'));
    await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
    expect(await screen.findByRole('button', { name: 'Save order' })).toBeEnabled();
    expect(names()).toEqual(['B', 'A', 'C']);
    expect(screen.getByText('Order changed —')).toBeInTheDocument();
  });

  describe('focus after the bar closes (review W9)', () => {
    it('Save order: focus goes to the last-moved row\'s arrow', async () => {
      setup();
      await userEvent.click(down('A'));
      await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
      await vi.waitFor(() => expect(screen.queryByText('Order changed —')).toBeNull());
      expect(down('A')).toHaveFocus();
    });

    it('Discard: focus goes to the moved row\'s arrow (the enabled one at its restored position)', async () => {
      setup();
      await userEvent.click(down('B'));
      await userEvent.click(down('B'));
      expect(names()).toEqual(['A', 'C', 'B']);
      await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
      expect(names()).toEqual(['A', 'B', 'C']);
      expect(down('B')).toHaveFocus();
    });

    it('while saving, Save order keeps focus (aria-disabled, not disabled) and ignores further clicks; Discard is inert too (A1-25)', async () => {
      let release!: () => void;
      const { saved } = setup({ onSaveOrder: () => new Promise<void>((r) => { release = r; }) });
      await userEvent.click(down('A'));
      screen.getByRole('button', { name: 'Save order' }).focus();
      await userEvent.keyboard('{Enter}');
      const busy = screen.getByRole('button', { name: 'Saving…' });
      // A natively disabled button loses focus in real browsers; it must stay enabled-but-inert.
      expect(busy).not.toBeDisabled();
      expect(busy).toHaveAttribute('aria-disabled', 'true');
      expect(busy).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      await userEvent.click(busy);
      await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
      expect(saved).toHaveLength(1);
      expect(names()).toEqual(['B', 'A', 'C']);
      expect(screen.getByText('Order changed —')).toBeInTheDocument();
      release();
      await vi.waitFor(() => expect(screen.queryByText('Order changed —')).toBeNull());
      expect(down('A')).toHaveFocus();
    });

    it('a failed save keeps focus on Save order', async () => {
      setup({ onSaveOrder: async () => { throw new Error('nope'); } });
      await userEvent.click(down('A'));
      await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
      expect(await screen.findByRole('button', { name: 'Save order' })).toHaveFocus();
    });
  });

  describe('grouped', () => {
    const items = [item('x1', 'x'), item('y1', 'y'), item('x2', 'x'), item('y2', 'y'), item('x3', 'x')];

    it('renders groups with headings and limits boundaries to each group', () => {
      setup({ items, grouped: true });
      const x = screen.getByRole('heading', { name: 'Group X' }).parentElement!;
      expect(within(x).getAllByRole('listitem').map((li) => li.textContent?.slice(0, 2))).toEqual(['X1', 'X2', 'X3']);
      expect(up('X1')).toBeDisabled();
      expect(down('X3')).toBeDisabled();
      expect(up('Y1')).toBeDisabled();
      expect(down('Y2')).toBeDisabled();
      expect(down('X1')).toBeEnabled();
    });

    it('swaps with the nearest neighbour of the same group in the flat array and announces the in-group position', async () => {
      const { saved } = setup({ items, grouped: true });
      await userEvent.click(down('X1'));
      expect(screen.getByText("Moved 'X1' to position 2 of 3")).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Save order' }));
      expect(saved[0]!.map((i) => i.id)).toEqual(['x2', 'y1', 'x1', 'y2', 'x3']);
    });

    it('hides a group without items', () => {
      setup({ items: [item('x1', 'x')], grouped: true });
      expect(screen.queryByRole('heading', { name: 'Group Y' })).toBeNull();
    });
  });

  it('renders the empty state', () => {
    render(
      <ReorderableList items={[]} label={(i: Item) => i.name} renderItem={() => null} onSaveOrder={vi.fn()} empty={<p>Nothing here.</p>} />,
    );
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
