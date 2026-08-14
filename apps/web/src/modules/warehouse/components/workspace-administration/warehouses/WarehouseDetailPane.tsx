import { Alert, Button, Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { GiveWarehouseAccessAction } from 'modules/warehouse/components/workspace-administration/warehouses/GiveWarehouseAccessAction';
import { WarehouseLifecycleActions } from 'modules/warehouse/components/workspace-administration/warehouses/WarehouseLifecycleActions';
import { WarehouseNameForm } from 'modules/warehouse/components/workspace-administration/warehouses/WarehouseNameForm';
import { WarehousePeopleList } from 'modules/warehouse/components/workspace-administration/warehouses/WarehousePeopleList';
import { ChevronLeftIcon } from 'shared/icons';

import type {
  Warehouse,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WarehouseDetailPaneProps = {
  canArchiveWarehouse: boolean;
  canCreateWarehouse: boolean;
  canRenameWarehouse: boolean;
  isOnlyNonArchived: boolean;
  people: WorkspaceUser[] | undefined;
  warehouse: Warehouse;
  onBack: () => void;
};

/**
 * The selected Warehouse: its name field, its archived-state presentation
 * (AC-12a), its lifecycle actions (AC-11, AC-11a), and who has access to it
 * (AC-33) — never what Role they hold there (design-handoff.md §"The level
 * boundary is part of the design").
 */
export const WarehouseDetailPane = ({
  canArchiveWarehouse,
  canCreateWarehouse,
  canRenameWarehouse,
  isOnlyNonArchived,
  people,
  warehouse,
  onBack,
}: WarehouseDetailPaneProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const isArchived = warehouse.archivedAt !== null;

  return (
    <section
      aria-label={t('warehouses.detail.regionLabel')}
      className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5"
    >
      <Button className="lg:hidden" size="sm" variant="ghost" onPress={onBack}>
        <ChevronLeftIcon />
        {t('warehouses.detail.back')}
      </Button>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{warehouse.name}</h2>
        <Chip
          color={isArchived ? 'default' : 'success'}
          size="sm"
          variant="soft"
        >
          {isArchived
            ? t('warehouses.chips.archived')
            : t('warehouses.chips.inOperation')}
        </Chip>
      </div>

      {isArchived ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('warehouses.archived.alertTitle')}</Alert.Title>
            <Alert.Description>
              {t('warehouses.archived.alertDescription')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <WarehouseNameForm
        canRenameWarehouse={canRenameWarehouse}
        warehouse={warehouse}
      />

      <WarehouseLifecycleActions
        canArchiveWarehouse={canArchiveWarehouse}
        canCreateWarehouse={canCreateWarehouse}
        isOnlyNonArchived={isOnlyNonArchived}
        warehouse={warehouse}
      />

      {people ? (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <GiveWarehouseAccessAction warehouse={warehouse} />
          </div>
          <WarehousePeopleList people={people} warehouse={warehouse} />
        </div>
      ) : null}
    </section>
  );
};
