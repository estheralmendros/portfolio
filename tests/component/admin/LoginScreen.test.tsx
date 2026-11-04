import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from '../../../src/admin/components/LoginScreen';

describe('LoginScreen', () => {
  it('renders a password input with instructions and submits the token', async () => {
    const onSubmit = vi.fn();
    render(<LoginScreen onSubmit={onSubmit} busy={false} message={null} />);
    const input = screen.getByLabelText('GitHub fine-grained token');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByText(/Contents → Read and write/)).toBeInTheDocument();
    expect(screen.getByText('Actions → Read-only (optional, for deploy status)')).toBeInTheDocument();
    expect(screen.getByText(/only estheralmendros\/portfolio/)).toBeInTheDocument();
    expect(screen.getByText(/sessionStorage/)).toBeInTheDocument();
    await userEvent.type(input, 'github_pat_abc');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(onSubmit).toHaveBeenCalledWith('github_pat_abc');
  });
  it('shows the message as an alert', () => {
    render(<LoginScreen onSubmit={vi.fn()} busy={false} message="Use a fine-grained token (it starts with github_pat_)." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Use a fine-grained token (it starts with github_pat_).');
  });
  it('disables the button while verifying', () => {
    render(<LoginScreen onSubmit={vi.fn()} busy message={null} />);
    expect(screen.getByRole('button', { name: /Checking/ })).toBeDisabled();
  });
});
