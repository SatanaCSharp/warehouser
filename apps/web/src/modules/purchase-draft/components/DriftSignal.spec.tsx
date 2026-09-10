import { render, screen } from '@testing-library/react';
import { DriftSignal } from 'modules/purchase-draft/components/DriftSignal';
import { describe, expect, it } from 'vitest';

// T20 DoD: "A test proves the Drift Signal is icon plus text and never
// colour alone" (AC-16, AC-16a).
describe('DriftSignal', () => {
  it('renders an icon alongside its text label', () => {
    render(<DriftSignal label="1 customer order changed" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('1 customer order changed');
    expect(status.querySelector('svg')).not.toBeNull();
  });

  it('carries its meaning in text content independent of any colour class', () => {
    render(<DriftSignal label="Needed-by date moved" />);

    // The accessible text is present regardless of styling — asserting the
    // text node exists (not merely a coloured element) is what proves the
    // signal is not colour-only.
    expect(
      screen.getByText('Needed-by date moved', { selector: 'span > span' }),
    ).toBeInTheDocument();
  });
});
