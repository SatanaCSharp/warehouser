import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Footer } from 'shared/layouts/Footer';
import { renderWithProviders } from 'test/render';

describe('Footer', () => {
  it('renders a full-width footer landmark with no focusable control', () => {
    renderWithProviders(<Footer />);

    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
    expect(within(footer).queryByRole('button')).not.toBeInTheDocument();
    expect(within(footer).queryByRole('link')).not.toBeInTheDocument();
    expect(
      footer.querySelector('a, button, input, select, textarea'),
    ).toBeNull();
  });
});
