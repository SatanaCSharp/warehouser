import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ArchivedWarehouseNotice } from 'shared/components/ArchivedWarehouseNotice';
import {
  ARCHIVED_WAREHOUSE_REASON_ID,
  useArchivedWarehouse,
} from 'shared/hooks/projections/useArchivedWarehouse';

// The verdict this reads is covered by `useArchivedWarehouse.spec.tsx`, which
// renders it inside a real Warehouse match. These cases are about what the
// notice says, so the projection is stubbed and no router is assembled.
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

describe('ArchivedWarehouseNotice', () => {
  beforeEach(() => {
    vi.mocked(useArchivedWarehouse).mockReset();
  });

  // AC-23 / CR-AC-17 — the archived state is named to every member of the
  // Warehouse, and the sentence states that the watch reads are unaffected.
  it('states that the Warehouse is archived and that its reads are unchanged', () => {
    inArchivedWarehouse(true);
    render(<ArchivedWarehouseNotice />);

    expect(
      screen.getByText('This warehouse has been archived'),
    ).toBeInTheDocument();
    expect(screen.getByText(/stay readable to everyone/u)).toBeInTheDocument();
  });

  // Every control disabled by the archived state points here with
  // `aria-describedby`, so the reason is written once per destination.
  it('carries the reason id every disabled control is described by', () => {
    inArchivedWarehouse(true);
    render(<ArchivedWarehouseNotice />);

    expect(screen.getByText(/stay readable to everyone/u)).toHaveAttribute(
      'id',
      ARCHIVED_WAREHOUSE_REASON_ID,
    );
  });

  it('renders nothing in a Warehouse still in operation', () => {
    inArchivedWarehouse(false);
    const { container } = render(<ArchivedWarehouseNotice />);

    expect(container).toBeEmptyDOMElement();
  });
});
