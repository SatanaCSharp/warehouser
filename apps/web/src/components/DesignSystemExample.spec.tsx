import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DesignSystemExample from 'components/DesignSystemExample';

describe('DesignSystemExample', () => {
  it('renders the design system preview card with its buttons', () => {
    render(<DesignSystemExample />);

    expect(screen.getByText('Design System Preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Secondary' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Danger' })).toBeInTheDocument();
  });

  it('renders a link to the login route', () => {
    render(<DesignSystemExample />);

    const link = screen.getByRole('link', { name: /log in/iu });
    expect(link).toHaveAttribute('href', '/login');
  });
});
