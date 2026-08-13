import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RouteErrorState } from 'shared/components/RouteErrorState';

describe('RouteErrorState', () => {
  it('invokes the router reset function when the retry control is activated', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(<RouteErrorState error={new Error('boom')} reset={reset} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('renders the danger-toned heading and body distinct from the no-context state', () => {
    render(<RouteErrorState error={new Error('boom')} reset={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("We couldn't check your access. Try again."),
    ).toBeInTheDocument();

    // CR-AC-08: a failed read is not the no-context state — neither its
    // heading nor its body renders here, and this state offers a retry the
    // no-context state does not.
    expect(
      screen.queryByRole('heading', { name: 'Nothing is entered yet' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Choose the workspace or a warehouse below to get started.',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });
});
