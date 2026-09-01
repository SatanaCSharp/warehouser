import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ArchivedWarehouseChip } from 'shared/components/ArchivedWarehouseChip';
import {
  ARCHIVED_WAREHOUSE_REASON_ID,
  useArchivedWarehouse,
} from 'shared/hooks/projections/useArchivedWarehouse';

// As in `ArchivedWarehouseNotice.spec.tsx`: the verdict read is covered by
// `useArchivedWarehouse.spec.tsx`, so these cases stub the projection.
vi.mock('shared/hooks/projections/useArchivedWarehouse', async () => {
  const actual = await vi.importActual<
    typeof import('shared/hooks/projections/useArchivedWarehouse')
  >('shared/hooks/projections/useArchivedWarehouse');
  return { ...actual, useArchivedWarehouse: vi.fn() };
});

const inArchivedWarehouse = (isArchived: boolean): void => {
  vi.mocked(useArchivedWarehouse).mockReturnValue({
    isArchived,
    reasonId: isArchived ? ARCHIVED_WAREHOUSE_REASON_ID : undefined,
  });
};

describe('ArchivedWarehouseChip', () => {
  beforeEach(() => {
    vi.mocked(useArchivedWarehouse).mockReset();
  });

  // design-handoff.md §Accessibility — nothing is communicated by colour alone,
  // so the chip carries the words `Archived warehouse` itself.
  it('labels the destination with the archived state in words', () => {
    inArchivedWarehouse(true);
    render(<ArchivedWarehouseChip />);

    expect(screen.getByText('Archived warehouse')).toBeInTheDocument();
  });

  it('renders nothing in a Warehouse still in operation', () => {
    inArchivedWarehouse(false);
    const { container } = render(<ArchivedWarehouseChip />);

    expect(container).toBeEmptyDOMElement();
  });
});
