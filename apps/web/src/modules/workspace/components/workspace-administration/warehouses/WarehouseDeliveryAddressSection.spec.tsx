import { QueryStatus } from '@reduxjs/toolkit/query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WarehouseDeliveryAddressSection } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseDeliveryAddressSection';
import { renderWithProviders } from 'test/render';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  stubWorkspaceServer,
  warehouseIds,
  workspaceWarehouses,
} from 'test/workspace-fixtures';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { WorkspacePermissionId as WorkspacePermissionIdType } from '@warehouser/shared-types/enums';
import type { AppStore } from 'store';

/**
 * T11/AC-10 — the Warehouse's own Delivery Address section of the Workspace
 * administration detail pane (`design-handoff.md` frame `e12gwk`).
 *
 * Its Permission is a **Workspace** Permission, so the section gates itself
 * with `WorkspacePermissionGate` and is **absent**, not disabled, for a member
 * who does not hold `WAREHOUSES:ADDRESS_UPDATE`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */

/** Central DC — the Warehouse the tab selects first. */
const centralDc = (): Warehouse => {
  const warehouse = workspaceWarehouses().find(
    (candidate) => candidate.id === warehouseIds.central,
  );
  if (!warehouse) {
    throw new Error('The Warehouse fixtures no longer contain Central DC');
  }
  return warehouse;
};

const contextIsResolved = (store: AppStore): boolean =>
  Object.values(store.getState().api.queries).some(
    (query) =>
      query?.endpointName === 'getWorkspaceContext' &&
      query.status === QueryStatus.fulfilled,
  );

const renderSection = async (
  permissionIds: readonly WorkspacePermissionIdType[],
  options: Parameters<typeof stubWorkspaceServer>[0] = {},
): Promise<{ requestedUrls: string[] }> => {
  const requestedUrls = stubWorkspaceServer({
    context: namedWorkspaceContext(permissionIds),
    ...options,
  });
  const store = authenticatedWorkspaceStore();

  renderWithProviders(
    <WarehouseDeliveryAddressSection warehouse={centralDc()} />,
    store,
  );

  await waitFor(() => expect(contextIsResolved(store)).toBe(true));
  return { requestedUrls };
};

describe('WarehouseDeliveryAddressSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC-10: offers the recorded address and its access notes to a holder of WAREHOUSES:ADDRESS_UPDATE', async () => {
    await renderSection([
      WorkspacePermissionId.WAREHOUSES_WATCH,
      WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
    ]);

    // The recorded address is read once the section is mounted, and the form
    // is remounted to seed itself from it — so the fields are re-queried here
    // rather than held across that remount.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^address$/iu })).toHaveValue(
        'Am Kai 7, 21079 Hamburg',
      ),
    );
    expect(screen.getByRole('textbox', { name: /access notes/iu })).toHaveValue(
      'Yard entrance on Kaistrasse; deliveries 06:00-18:00',
    );
  });

  it('AC-10: is absent, not disabled, for a member without WAREHOUSES:ADDRESS_UPDATE, and reads nothing', async () => {
    const { requestedUrls } = await renderSection([
      WorkspacePermissionId.WAREHOUSES_WATCH,
    ]);

    expect(
      screen.queryByRole('textbox', { name: /^address$/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /access notes/iu }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/delivery address/iu)).not.toBeInTheDocument();
    expect(
      requestedUrls.filter((url) => url.includes('/delivery-address')),
    ).toEqual([]);
  });

  it('AC-10: records a corrected address in place, sending the address and its access notes', async () => {
    const onSetWarehouseDeliveryAddress = vi.fn();
    await renderSection(
      [
        WorkspacePermissionId.WAREHOUSES_WATCH,
        WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
      ],
      { onSetWarehouseDeliveryAddress },
    );

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^address$/iu })).toHaveValue(
        'Am Kai 7, 21079 Hamburg',
      ),
    );
    const address = screen.getByRole('textbox', { name: /^address$/iu });
    await userEvent.clear(address);
    await userEvent.type(address, 'Am Kai 9, 21079 Hamburg');
    await userEvent.click(
      screen.getByRole('button', { name: /save delivery address/iu }),
    );

    await waitFor(() =>
      expect(onSetWarehouseDeliveryAddress).toHaveBeenCalledWith({
        addressText: 'Am Kai 9, 21079 Hamburg',
        accessNotes: 'Yard entrance on Kaistrasse; deliveries 06:00-18:00',
      }),
    );
  });
});
