import { Alert, Button } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AddWarehouseAction } from 'modules/workspace/components/workspace-administration/warehouses/AddWarehouseAction';
import { ArchiveWarehouseDialog } from 'modules/workspace/components/workspace-administration/warehouses/ArchiveWarehouseDialog';
import { useSetWarehouseArchival } from 'modules/workspace/hooks/mutations/useSetWarehouseArchival';
import { Conditional } from 'shared/components/Conditional';
import { useReturnFocusOnClose } from 'shared/hooks/effects/useReturnFocusOnClose';
import { ArchiveIcon, ArrowRightLeftIcon } from 'shared/icons';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WarehouseLifecycleActionsProps = {
  canArchiveWarehouse: boolean;
  canCreateWarehouse: boolean;
  isOnlyNonArchived: boolean;
  warehouse: Warehouse;
};

/**
 * Archives or restores the Warehouse record itself (AC-11, AC-11a, AC-12a).
 * An actor without the archive Permission gets neither control (AC-30).
 * `canArchiveWarehouse`/`canCreateWarehouse` are read from the single
 * Workspace context read `WarehousesTab` owns (see `AddWarehouseAction`).
 */
export const WarehouseLifecycleActions = ({
  canArchiveWarehouse,
  canCreateWarehouse,
  isOnlyNonArchived,
  warehouse,
}: WarehouseLifecycleActionsProps): ReactElement | null => {
  const { t } = useTranslation('warehouse');
  const setWarehouseArchival = useSetWarehouseArchival();
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  // Escape dismissal both closes the Modal and returns focus to the trigger
  // (design-handoff.md §Accessibility).
  const archiveTriggerRef = useReturnFocusOnClose(isArchiveDialogOpen);
  const reasonId = `warehouse-archive-reason-${warehouse.id}`;

  const onRestore = (): void => void setWarehouseArchival(warehouse.id, false);

  const onPressArchive = (): void => setIsArchiveDialogOpen(true);

  const onCloseArchiveDialog = (): void => setIsArchiveDialogOpen(false);

  if (!canArchiveWarehouse) {
    return null;
  }

  if (warehouse.archivedAt !== null) {
    return (
      <Button variant="outline" onPress={onRestore}>
        <ArrowRightLeftIcon />
        {t('warehouses.restore.trigger')}
      </Button>
    );
  }

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
        <Button
          ref={archiveTriggerRef}
          variant="danger-soft"
          aria-describedby={isOnlyNonArchived ? reasonId : undefined}
          isDisabled={isOnlyNonArchived}
          onPress={onPressArchive}
        >
          <ArchiveIcon />
          {t('warehouses.archive.trigger')}
        </Button>
        <Conditional when={isOnlyNonArchived}>
          <AddWarehouseAction
            canCreateWarehouse={canCreateWarehouse}
            label={t('warehouses.lastWarehouse.addFirst')}
          />
        </Conditional>
      </div>
      <Conditional when={isArchiveDialogOpen}>
        <ArchiveWarehouseDialog
          warehouse={warehouse}
          onClose={onCloseArchiveDialog}
        />
      </Conditional>
    </>
  );
};
