import { render, screen } from '@testing-library/react';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { describe, expect, it, vi } from 'vitest';

// What the retry control actually DOES is asserted where it is observable —
// `modules/home/route.spec.tsx` fails the Workspace-context read once,
// activates the control and asserts the actor then lands. Asserting here that
// the injected `reset` was called would be true by construction for any button
// wired to its own prop, and stayed green for the whole period in which `reset`
// alone could not retry anything (CR-AC-08).
describe('RouteErrorState', () => {
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
