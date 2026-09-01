import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DemandPendingState } from 'modules/customer-order/components/DemandPendingState';

// Frame `hWFRW` tile `EZn9c` — the Demand destination waits behind a skeleton
// shaped like its own table, announced as the dataset that is arriving rather
// than as a generic application shell string. `DatasetSkeleton` itself is
// covered by its own spec; what is pinned here is what this destination
// announces, because that string is the whole difference between the two.

describe('DemandPendingState', () => {
  it('announces the dataset that is loading, not the application', () => {
    render(<DemandPendingState />);

    const skeleton = screen.getByRole('status', { name: 'Loading demand' });
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
  });
});
