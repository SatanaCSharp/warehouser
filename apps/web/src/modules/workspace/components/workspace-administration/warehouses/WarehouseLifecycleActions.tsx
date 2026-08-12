import { Alert, Button } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AddWarehouseAction } from 'modules/workspace/components/workspace-administration/warehouses/AddWarehouseAction';
import { ArchiveWarehouseDialog } from 'modules/workspace/components/workspace-administration/warehouses/ArchiveWarehouseDialog';
import { useSetWarehouseArchival } from 'modules/workspace/hooks/useSetWarehouseArchival';
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
  const { t } = useTranslation('workspace');
  const setWarehouseArchival = useSetWarehouseArchival();
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const archiveTriggerRef = useRef<HTMLButtonElement>(null);
  const reasonId = `warehouse-archive-reason-${warehouse.id}`;

  // Escape dismissal both closes the Modal and returns focus to the trigger
  // (design-handoff.md §Accessibility). The cleanup runs once the Modal has
  // actually unmounted, after its own focus trap has released — calling
  // `.focus()` synchronously inside the close handler races that trap and
  // loses.
  useEffect(() => {
    if (!isArchiveDialogOpen) {
      return undefined;
    }
    const trigger = archiveTriggerRef.current;
    return () => trigger?.focus();
  }, [isArchiveDialogOpen]);

  if (!canArchiveWarehouse) {
    return null;
  }

  if (warehouse.archivedAt !== null) {
    return (
      <Button
        variant="outline"
        onPress={() => setWarehouseArchival(warehouse.id, false)}
      >
        <ArrowRightLeftIcon />
        {t('warehouses.restore.trigger')}
      </Button>
    );
  }

  return (
    <>
      {isOnlyNonArchived ? (
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
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          ref={archiveTriggerRef}
          variant="danger-soft"
          aria-describedby={isOnlyNonArchived ? reasonId : undefined}
          isDisabled={isOnlyNonArchived}
          onPress={() => setIsArchiveDialogOpen(true)}
        >
          <ArchiveIcon />
          {t('warehouses.archive.trigger')}
        </Button>
        {isOnlyNonArchived ? (
          <AddWarehouseAction
            canCreateWarehouse={canCreateWarehouse}
            label={t('warehouses.lastWarehouse.addFirst')}
          />
        ) : null}
      </div>
      {isArchiveDialogOpen ? (
        <ArchiveWarehouseDialog
          warehouse={warehouse}
          onClose={() => setIsArchiveDialogOpen(false)}
        />
      ) : null}
    </>
  );
};
