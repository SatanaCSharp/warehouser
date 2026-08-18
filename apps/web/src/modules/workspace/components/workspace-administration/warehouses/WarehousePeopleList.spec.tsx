import { QueryStatus } from '@reduxjs/toolkit/query';
import { screen, waitFor, within } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WarehouseDetailPane } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseDetailPane';
import { renderWithProviders } from 'test/render';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  stubWorkspaceServer,
  warehouseIds,
  workspaceIds,
  workspaceUsers,
  workspaceWarehouses,
} from 'test/workspace-fixtures';

import type {
  Warehouse,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import type { WorkspacePermissionId as WorkspacePermissionIdType } from '@warehouser/shared-types/enums';
import type { AppStore } from 'store';

/**
 * The three cases `sad.md` §5.4 assigns to `WarehousePeopleList`: the two
 * pane-scoped cases of the former "the detail pane and the level boundary
 * (AC-33)" block, and the disabled-own-row case of "withdrawing warehouse
 * access" (CR-RG-03). Each is carried over from `WarehousesTab.spec.tsx` at
 * `baseline_revision = 42f1205d552f8284f8ec57358ad9022340b5f76e` with every
 * expectation's subject and expected value unchanged; only the mount changed
 * (CR-RG-01 §"Assertion drift, defined").
 *
 * Both source blocks split rather than moved whole: the three cases left
 * behind assert orchestration outcomes — a request that must not fire, a
 * mutation, and a server denial — which no isolated mount of this pane can
 * see (`sad.md` §4.6).
 *
 * **Why the mount is `WarehouseDetailPane`.** Two of these cases query the
 * detail region and the selected Warehouse's heading, neither of which this
 * list renders, and one asserts that *no* Warehouse Role reaches that whole
 * region. Fabricating a region and a heading in the harness would turn those
 * expectations into assertions about the harness and would quietly narrow the
 * negative one; mounting the pane the list lives in keeps every expectation
 * asserting production markup at its baseline scope. The tab's orchestration
 * is still absent — no Warehouse list query, no Users query, no selection and
 * no per-Warehouse filter — so the people and the Warehouse arrive as plain
 * props.
 *
 * The store and the stubbed context are not optional here, unlike the two
 * leaves T11 carved out: `WarehousePersonRow` is an Action row, and it reads
 * the acting member and `WAREHOUSE_MEMBERSHIPS:REVOKE` itself.
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

/**
 * The Workspace Users who reach Central DC, as the tab passes them down. The
 * tab owns the filter, so Lena — who belongs to no Warehouse at all — is
 * absent from this pane's input rather than dropped by the pane.
 */
const centralDcPeople = (): WorkspaceUser[] =>
  workspaceUsers().filter((user) =>
    user.warehouses.some(
      (warehouse) => warehouse.warehouseId === warehouseIds.central,
    ),
  );

const watchOnly = [
  WorkspacePermissionId.WAREHOUSES_WATCH,
  WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
];

const withAccessManagement = [
  ...watchOnly,
  WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
  WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
];

const contextIsResolved = (store: AppStore): boolean =>
  Object.values(store.getState().api.queries).some(
    (query) =>
      query?.endpointName === 'getWorkspaceContext' &&
      query.status === QueryStatus.fulfilled,
  );

/**
 * Mounts the pane for an actor holding `permissionIds`, then waits for the
 * one read `WarehousePersonRow` performs to settle — the tab reached that
 * state before rendering the pane at all, so waiting for it here keeps each
 * case asserting against the same resolved markup it did at baseline.
 *
 * That wait is a **new setup-level assertion** pinning the harness, which
 * CR-RG-01 permits; no existing expectation depends on it.
 */
const renderPeoplePane = async (
  permissionIds: readonly WorkspacePermissionIdType[],
): Promise<void> => {
  stubWorkspaceServer({ context: namedWorkspaceContext(permissionIds) });
  const store = authenticatedWorkspaceStore();

  renderWithProviders(
    <WarehouseDetailPane
      canArchiveWarehouse={false}
      canCreateWarehouse={false}
      canRenameWarehouse={false}
      isOnlyNonArchived={false}
      people={centralDcPeople()}
      warehouse={centralDc()}
      onBack={() => undefined}
    />,
    store,
  );

  await waitFor(() => expect(contextIsResolved(store)).toBe(true));
};

const detailPane = async (): Promise<HTMLElement> =>
  screen.findByRole('region', { name: /warehouse detail/iu });

describe('WarehousePeopleList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('the detail pane and the level boundary (AC-33)', () => {
    it('shows who has access to the selected Warehouse and never what Role they hold there', async () => {
      await renderPeoplePane(watchOnly);

      const detail = await detailPane();
      expect(
        within(detail).getByRole('heading', { name: /central dc/iu }),
      ).toBeInTheDocument();
      expect(
        within(detail).getByText('yurii@example.test'),
      ).toBeInTheDocument();
      expect(
        within(detail).getByText('anna.kravets@example.test'),
      ).toBeInTheDocument();
      // Anna belongs to Central DC; Lena belongs to no Warehouse at all.
      expect(
        within(detail).queryByText('lena.boiko@example.test'),
      ).not.toBeInTheDocument();

      // AC-33 covers the Users and the Warehouses they belong to — not their
      // Warehouse Roles. Neither the protected Manager Role nor any Role
      // identifier may reach this pane (design-handoff.md §The level boundary).
      expect(detail.textContent).not.toMatch(/manager/iu);
      expect(detail.textContent).not.toContain(workspaceIds.warehouseRole);
    });

    it('carries the line that says which level decides what a person may do inside the Warehouse', async () => {
      await renderPeoplePane(watchOnly);

      expect(
        within(await detailPane()).getByText(
          /what they may do inside it is decided by that role, not by the workspace/iu,
        ),
      ).toBeInTheDocument();
    });
  });

  describe('withdrawing warehouse access (AC-25b, AC-25c)', () => {
    const rowFor = (email: string): HTMLElement => {
      const row = screen.getByText(email).closest('li');
      if (!row) {
        throw new Error(`No person row found for ${email}`);
      }
      return row;
    };

    it("exposes Withdraw access as disabled on the acting member's own row, with the reason accessible to assistive technology (AC-25c)", async () => {
      await renderPeoplePane(withAccessManagement);
      await detailPane();

      // Yurii is the acting member (test/workspace-fixtures.ts) and belongs to
      // Central DC — a member never withdraws their own Warehouse authority.
      const ownWithdraw = within(rowFor('yurii@example.test')).getByRole(
        'button',
        { name: /withdraw access/iu },
      );
      expect(ownWithdraw).toBeDisabled();
      const describedBy = ownWithdraw.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
        /own .*(?:warehouse )?authority/iu,
      );
    });
  });
});
