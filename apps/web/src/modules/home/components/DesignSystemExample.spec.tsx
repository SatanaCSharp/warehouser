import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DesignSystemExample } from 'modules/home/components/DesignSystemExample';
import { ROUTES } from 'shared/constants/routes';
import { renderWithProviders } from 'test/render';

describe('DesignSystemExample', () => {
  it('renders the design system preview card with its buttons', () => {
    renderWithProviders(<DesignSystemExample />);

    expect(screen.getByText('Design System Preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Secondary' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Danger' })).toBeInTheDocument();
  });

  it('renders a link to the login route', () => {
    renderWithProviders(<DesignSystemExample />);

    expect(screen.getByRole('link', { name: /log in/iu })).toHaveAttribute(
      'href',
      ROUTES.LOGIN,
    );
  });
});
