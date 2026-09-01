import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DatasetEmptyState } from 'shared/components/DatasetEmptyState';

describe('DatasetEmptyState', () => {
  it('names why the collection is empty, explains it, and offers the action that fills it', () => {
    render(
      <DatasetEmptyState
        heading="No customer is waiting for anything yet"
        description="Record what a customer has asked for and it appears here."
        action={<button type="button">Record demand</button>}
      />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'No customer is waiting for anything yet',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Record what a customer has asked for and it appears here.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Record demand' }),
    ).toBeInTheDocument();
  });

  it('announces itself as a resolved outcome rather than an error', () => {
    render(
      <DatasetEmptyState
        heading="This warehouse deals in nothing yet"
        description="An item is what demand and a draft line both name."
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers no action when the reader is given none', () => {
    render(
      <DatasetEmptyState
        heading="This warehouse deals in nothing yet"
        description="An item is what demand and a draft line both name."
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
