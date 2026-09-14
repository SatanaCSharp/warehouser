import type {
  Warehouse,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import countBy from 'lodash/countBy';
import flatMap from 'lodash/flatMap';
import { useListWorkspaceWarehousesQuery } from 'modules/workspace/api/warehouse-api';
import { AddWarehouseAction } from 'modules/workspace/components/workspace-administration/warehouses/AddWarehouseAction';
import { WarehouseDetailPane } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseDetailPane';
import { WarehouseList } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseList';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useListWorkspaceUsersQuery } from 'shared/api/workspace/workspace-users-api';
import {
  hasWorkspacePermission,
  useCurrentWorkspaceContext,
} from 'shared/hooks/queries/useWorkspacePermissions';

const peopleCountsByWarehouse = (
  users: WorkspaceUser[],
): Record<string, number> =>
  countBy(flatMap(users, (user) => user.warehouses.map((w) => w.warehouseId)));

const peopleForWarehouse = (
  users: WorkspaceUser[],
  warehouseId: string,
): WorkspaceUser[] =>
  users.filter((user) =>
    user.warehouses.some((w) => w.warehouseId === warehouseId),
  );

const isNonArchived = (warehouse: Warehouse): boolean =>
  warehouse.archivedAt === null;

/** The Warehouse the pane is opened for: the one selected, or the first the Workspace holds. */
const selectedWarehouseOf = (
  warehouses: Warehouse[],
  selectedWarehouseId: string | undefined,
): Warehouse | undefined =>
  warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) ??
  warehouses[0];

const nonArchivedCountOf = (warehouses: Warehouse[]): number =>
  warehouses.filter(isNonArchived).length;

/** AC-33 — the last Warehouse standing cannot be archived, and only the pane it is open in says so. */
const isOnlyNonArchived = (
  warehouse: Warehouse,
  nonArchivedCount: number,
): boolean => isNonArchived(warehouse) && nonArchivedCount === 1;

/** Absent rather than empty when the people read was never made: an actor without the Permission is
 * told nothing about the read, not that it found nobody. */
const peopleCountsOf = (
  users: WorkspaceUser[] | undefined,
): Record<string, number> | undefined =>
  users ? peopleCountsByWarehouse(users) : undefined;

const peopleForPane = (
  mayReadPeople: boolean,
  users: WorkspaceUser[] | undefined,
  warehouseId: string,
): WorkspaceUser[] | undefined =>
  mayReadPeople && users ? peopleForWarehouse(users, warehouseId) : undefined;

/** CR-AC-13 — the same source `WarehouseSwitcher` reads, so the Enter action and the switcher can
 * never disagree about which Warehouses the actor may enter. */
const membershipWarehouseIdsOf = (
  workspaceContext: { warehouses: { warehouseId: string }[] } | undefined,
): string[] => {
  const memberships = workspaceContext?.warehouses ?? [];

  return memberships.map((warehouse) => warehouse.warehouseId);
};

/** The list is hidden behind the detail pane on a narrow viewport once a Warehouse is opened. */
const listVisibility = (isDetailActive: boolean): string =>
  isDetailActive ? 'hidden lg:block' : 'lg:block';

/**
 * The Warehouses tab: the Workspace's Warehouse list, the selected
 * Warehouse's detail pane, and the dialogs that change it (AC-06, AC-08,
 * AC-09, AC-11, AC-11a, AC-12a, AC-33). Each dataset is rendered and
 * requested only under its own watch Permission.
 *
 * The tab decides no control's authority. It resolves the Warehouse list, the
 * people read it is entitled to, and which Warehouse is selected; who may
 * create, rename, archive or grant access is each control's own gate to answer
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const WarehousesTab = (): ReactElement => {
  const { t } = useTranslation('warehouse');
  // Both reads are cache reads: `/workspace`'s route loader dispatched them and
  // awaited them before this tab was committed, and a descendant gate reads the
  // same cached context entry rather than issuing a second request, because RTK
  // Query deduplicates the subscription this read has already opened. The
  // declaration order carries no ordering intent — the loader dispatches the
  // destination's reads together (global-loader CH-14).
  // `isError` travels one hop to the list that renders it. The route's loader
  // settles this read, so the tab is committed on a rejected one and the list
  // must say so rather than state the Workspace has no Warehouse
  // (`frontend-architecture.md` §Page).
  const { data: warehouses = [], isError: isWarehouseReadFailed } =
    useListWorkspaceWarehousesQuery();
  const { workspaceContext, workspacePermissionIds } =
    useCurrentWorkspaceContext();
  // The one Permission this tab still reads itself, because it decides a
  // *request* rather than an element: a dataset the actor may not read is never
  // fetched (AC-30). Every control below gates itself
  // (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
  const canReadPeople = hasWorkspacePermission(
    workspacePermissionIds,
    WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
  );
  const { data: users } = useListWorkspaceUsersQuery(undefined, {
    skip: !canReadPeople,
  });
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<
    string | undefined
  >(undefined);
  const [isDetailActive, setIsDetailActive] = useState(false);

  const selectedWarehouse = selectedWarehouseOf(
    warehouses,
    selectedWarehouseId,
  );
  const nonArchivedCount = nonArchivedCountOf(warehouses);
  const peopleCounts = peopleCountsOf(users);
  // One prop, one hop; no additional query.
  const membershipWarehouseIds = membershipWarehouseIdsOf(workspaceContext);

  const selectWarehouse = (warehouseId: string): void => {
    setSelectedWarehouseId(warehouseId);
    setIsDetailActive(true);
  };

  const onBack = (): void => setIsDetailActive(false);

  // The pane reads the Warehouse it was opened for, so it is resolved here
  // rather than gated inline: `Conditional` evaluates both arms, and an empty
  // Workspace selects none.
  const detailPane = !selectedWarehouse ? null : (
    <WarehouseDetailPane
      key={selectedWarehouse.id}
      isOnlyNonArchived={isOnlyNonArchived(selectedWarehouse, nonArchivedCount)}
      people={peopleForPane(canReadPeople, users, selectedWarehouse.id)}
      warehouse={selectedWarehouse}
      onBack={onBack}
    />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div>
        <div className="mb-4 flex justify-end">
          <AddWarehouseAction label={t('warehouses.add.trigger')} />
        </div>
        <WarehouseList
          className={listVisibility(isDetailActive)}
          isError={isWarehouseReadFailed}
          membershipWarehouseIds={membershipWarehouseIds}
          peopleCounts={peopleCounts}
          selectedWarehouseId={selectedWarehouse?.id}
          warehouses={warehouses}
          onSelect={selectWarehouse}
        />
      </div>

      {detailPane}
    </div>
  );
};
