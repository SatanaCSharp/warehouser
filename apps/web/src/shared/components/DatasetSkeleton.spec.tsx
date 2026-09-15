import { render, screen } from '@testing-library/react';
import { DatasetSkeleton } from 'shared/components/DatasetSkeleton';
import { describe, expect, it } from 'vitest';

describe('DatasetSkeleton', () => {
  it('announces the dataset that is arriving, not the application', () => {
    render(<DatasetSkeleton label="Loading demand" />);

    expect(
      screen.getByRole('status', { name: 'Loading demand' }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('draws one row per requested row, shaped to the given columns', () => {
    render(
      <DatasetSkeleton
        label="Loading items"
        rows={3}
        columns={['40%', '12%', '12%', '16%']}
      />,
    );

    const region = screen.getByRole('status', { name: 'Loading items' });
    expect(region.children).toHaveLength(3);
    expect(region.children[0].children).toHaveLength(4);
    expect(region.children[0].children[0]).toHaveStyle({ width: '40%' });
  });
});
