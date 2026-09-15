import { Alert, AlertDialog, Button, Separator } from '@heroui/react';
import type { Warehouse } from '@warehouser/contracts/workspaces';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useSetWarehouseArchivalMutation } from 'modules/workspace/api/warehouse-api';
import { AddWarehouseAction } from 'modules/workspace/components/workspace-administration/warehouses/AddWarehouseAction';
import { ArchiveWarehouseDialog } from 'modules/workspace/components/workspace-administration/warehouses/ArchiveWarehouseDialog';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
import { ArchiveIcon, ArrowRightLeftIcon } from 'shared/icons';

/**
 * The archive side of the lifecycle: the confirmation dialog's trigger, the
 * reason it is unavailable on the last Warehouse still in operation, and the
 * alternative offered there (AC-11a). Private to this file — the archived
 * Warehouse's Restore control is the other arm of the same gate.
 */
const ArchiveWarehouseControls = ({
  isOnlyNonArchived,
  warehouse,
}: {
  isOnlyNonArchived: boolean;
  warehouse: Warehouse;
}): ReactElement => {
  const { t } = useTranslation('warehouse');
  const reasonId = `warehouse-archive-reason-${warehouse.id}`;

  return (
    <>
      <Conditional when={isOnlyNonArchived}>
        <Alert id={reasonId} role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t('warehouses.lastWarehouse.alertTitle', {
                name: warehouse.name,
              })}
            </Alert.Title>
            <Alert.Description>
              {t('warehouses.lastWarehouse.alertDescription')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
      <div className="flex flex-wrap gap-2">
        {/*
          Escape dismissal both closes the confirmation and returns focus to
          this trigger (design-handoff.md §Accessibility) — the `AlertDialog`
          root around the pair owns both.
        */}
        <AlertDialog>
          <Button
            variant="danger-soft"
            aria-describedby={isOnlyNonArchived ? reasonId : undefined}
            isDisabled={isOnlyNonArchived}
          >
            <ArchiveIcon />
            {t('warehouses.archive.trigger')}
          </Button>
          <TriggeredDialog>
            <ArchiveWarehouseDialog warehouse={warehouse} />
          </TriggeredDialog>
        </AlertDialog>
        <Conditional when={isOnlyNonArchived}>
          <AddWarehouseAction label={t('warehouses.lastWarehouse.addFirst')} />
        </Conditional>
      </div>
    </>
  );
};

type WarehouseLifecycleActionsProps = {
  isOnlyNonArchived: boolean;
  warehouse: Warehouse;
};

/**
 * Archives or restores the Warehouse record itself (AC-11, AC-11a, AC-12a). An
 * actor without `WAREHOUSES:ARCHIVE` gets neither control (AC-30), which is one
 * gate around both arms rather than a boolean threaded down from the tab
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * Which arm renders is the Warehouse's own archived state, not authority — the
 * two rules stay separate and neither re-tests the other.
 */
export const WarehouseLifecycleActions = ({
  isOnlyNonArchived,
  warehouse,
}: WarehouseLifecycleActionsProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  const [setWarehouseArchival] = useSetWarehouseArchivalMutation();

  const onRestore = (): void =>
    void setWarehouseArchival({ warehouseId: warehouse.id, archived: false });

  return (
    <WorkspacePermissionGate
      permission={WorkspacePermissionId.WAREHOUSES_ARCHIVE}
    >
      {/*
        The lifecycle row closes the detail pane, ruled off from the people
        above it (`warehouse-address-desktop-v1.html`). The rule is inside the
        gate because the row it introduces is withheld whole from an actor
        without `WAREHOUSES:ARCHIVE`.
      */}
      <Separator />
      <Conditional
        when={warehouse.archivedAt !== null}
        otherwise={
          <ArchiveWarehouseControls
            isOnlyNonArchived={isOnlyNonArchived}
            warehouse={warehouse}
          />
        }
      >
        <Button variant="outline" onPress={onRestore}>
          <ArrowRightLeftIcon />
          {t('warehouses.restore.trigger')}
        </Button>
      </Conditional>
    </WorkspacePermissionGate>
  );
};
