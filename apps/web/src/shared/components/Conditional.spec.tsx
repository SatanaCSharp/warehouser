import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Conditional } from 'shared/components/Conditional';

describe('Conditional', () => {
  it('renders its children when the gate is truthy', () => {
    render(
      <Conditional when={1}>
        <p>shown</p>
      </Conditional>,
    );

    expect(screen.getByText('shown')).toBeInTheDocument();
  });

  it('renders nothing at all when the gate is falsy', () => {
    const { container } = render(
      <Conditional when={undefined}>
        <p>shown</p>
      </Conditional>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the other branch when one is given', () => {
    render(
      <Conditional when={false} otherwise={<p>fallback</p>}>
        <p>shown</p>
      </Conditional>,
    );

    expect(screen.getByText('fallback')).toBeInTheDocument();
    expect(screen.queryByText('shown')).not.toBeInTheDocument();
  });
});
