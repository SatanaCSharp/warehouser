import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import countBy from 'lodash/countBy';
import flatMap from 'lodash/flatMap';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useListWorkspaceWarehousesQuery } from 'modules/warehouse/api/warehouse-api';
import { AddWarehouseAction } from 'modules/warehouse/components/workspace-administration/warehouses/AddWarehouseAction';
import { WarehouseDetailPane } from 'modules/warehouse/components/workspace-administration/warehouses/WarehouseDetailPane';
import { WarehouseList } from 'modules/warehouse/components/workspace-administration/warehouses/WarehouseList';
import { useListWorkspaceUsersQuery } from 'shared/api/workspace/workspace-users-api';
import {
  hasWorkspacePermission,
  useCurrentWorkspaceContext,
} from 'shared/hooks/useWorkspacePermissions';

import type { WorkspaceUser } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

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

/**
 * The Warehouses tab: the Workspace's Warehouse list, the selected
 * Warehouse's detail pane, and the dialogs that change it (AC-06, AC-08,
 * AC-09, AC-11, AC-11a, AC-12a, AC-33). Each dataset is rendered and
 * requested only under its own watch Permission.
 */
export const WarehousesTab = (): ReactElement => {
  const { t } = useTranslation('warehouse');
  // Declared before the single Workspace context read below, so this tab's
  // own Warehouse list request is always the first network call this tab
  // makes — every capability this tab and its children need is derived from
  // that one context read rather than an independent hook call per leaf, so
  // no descendant races it with a second context request of its own.
  const { data: warehouses = [], isLoading: isWarehousesLoading } =
    useListWorkspaceWarehousesQuery();
  const {
    isLoading: isContextLoading,
    workspaceContext,
    workspacePermissionIds,
  } = useCurrentWorkspaceContext();
  const canReadPeople = hasWorkspacePermission(
    workspacePermissionIds,
    WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
  );
  const canCreateWarehouse = hasWorkspacePermission(
    workspacePermissionIds,
    WorkspacePermissionId.WAREHOUSES_CREATE,
  );
  const canRenameWarehouse = hasWorkspacePermission(
    workspacePermissionIds,
    WorkspacePermissionId.WAREHOUSES_RENAME,
  );
  const canArchiveWarehouse = hasWorkspacePermission(
    workspacePermissionIds,
    WorkspacePermissionId.WAREHOUSES_ARCHIVE,
  );
  const { data: users } = useListWorkspaceUsersQuery(undefined, {
    skip: !canReadPeople,
  });
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<
    string | undefined
  >(undefined);
  const [isDetailActive, setIsDetailActive] = useState(false);

  // Neither pane renders ahead of the datasets it needs — the detail pane's
  // people list would otherwise flash in a heartbeat after the list itself,
  // and its per-Warehouse people count would flash in even later. Reads
  // `users === undefined` rather than the query's own `isLoading`, which
  // still reads `false` for the one render where a newly un-skipped query
  // has not started fetching yet.
  const isLoading =
    isWarehousesLoading || isContextLoading || (canReadPeople && !users);

  const selectedWarehouse =
    warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) ??
    warehouses[0];
  const nonArchivedCount = warehouses.filter(
    (warehouse) => warehouse.archivedAt === null,
  ).length;
  const peopleCounts = users ? peopleCountsByWarehouse(users) : undefined;
  // CR-AC-13 — the same source `WarehouseSwitcher` reads, so the Enter action
  // and the switcher can never disagree about which Warehouses the actor may
  // enter. One prop, one hop; no additional query.
  const membershipWarehouseIds =
    workspaceContext?.warehouses.map((warehouse) => warehouse.warehouseId) ??
    [];

  const selectWarehouse = (warehouseId: string): void => {
    setSelectedWarehouseId(warehouseId);
    setIsDetailActive(true);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div>
        <div className="mb-4 flex justify-end">
          <AddWarehouseAction
            canCreateWarehouse={canCreateWarehouse}
            label={t('warehouses.add.trigger')}
          />
        </div>
        <WarehouseList
          className={isDetailActive ? 'hidden lg:block' : 'lg:block'}
          isLoading={isLoading}
          membershipWarehouseIds={membershipWarehouseIds}
          peopleCounts={peopleCounts}
          selectedWarehouseId={selectedWarehouse?.id}
          warehouses={warehouses}
          onSelect={selectWarehouse}
        />
      </div>

      {!isLoading && selectedWarehouse ? (
        <WarehouseDetailPane
          key={selectedWarehouse.id}
          canArchiveWarehouse={canArchiveWarehouse}
          canCreateWarehouse={canCreateWarehouse}
          canRenameWarehouse={canRenameWarehouse}
          isOnlyNonArchived={
            selectedWarehouse.archivedAt === null && nonArchivedCount === 1
          }
          people={
            canReadPeople && users
              ? peopleForWarehouse(users, selectedWarehouse.id)
              : undefined
          }
          warehouse={selectedWarehouse}
          onBack={() => setIsDetailActive(false)}
        />
      ) : null}
    </div>
  );
};
