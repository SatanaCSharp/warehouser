import { Alert, Button, Chip, Separator } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { GiveWarehouseAccessAction } from 'modules/workspace/components/workspace-administration/warehouses/GiveWarehouseAccessAction';
import { WarehouseDeliveryAddressSection } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseDeliveryAddressSection';
import { WarehouseLifecycleActions } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseLifecycleActions';
import { WarehouseNameForm } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseNameForm';
import { WarehousePeopleList } from 'modules/workspace/components/workspace-administration/warehouses/WarehousePeopleList';
import { Conditional } from 'shared/components/Conditional';
import { useContentTransition } from 'shared/hooks/effects/useContentTransition';
import { ChevronLeftIcon } from 'shared/icons';

import type {
  Warehouse,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WarehouseDetailPaneProps = {
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
 *
 * The pane carries no authority of its own: every control below gates itself on
 * the Workspace Permission it needs, so nothing here decides who may rename,
 * archive or grant access
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const WarehouseDetailPane = ({
  isOnlyNonArchived,
  people,
  warehouse,
  onBack,
}: WarehouseDetailPaneProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  const isArchived = warehouse.archivedAt !== null;
  // Selecting another Warehouse in the list replaces the whole pane, so the
  // arriving one is what re-enters.
  const paneRef = useContentTransition<HTMLElement>(warehouse.id);

  // The panel reads the people list, so it is resolved here rather than gated
  // inline: `Conditional` evaluates both arms, and the list is undefined until
  // the read the actor is entitled to has arrived.
  //
  // The rule above it belongs to the panel rather than to the pane, for the
  // same reason every other block below carries its own: each of them is
  // withheld by a Permission or an unarrived read, and a rule that stayed in
  // the pane would be left behind by the block it introduces.
  const peoplePanel = !people ? null : (
    <>
      <Separator />
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <GiveWarehouseAccessAction warehouse={warehouse} />
        </div>
        <WarehousePeopleList people={people} warehouse={warehouse} />
      </div>
    </>
  );

  return (
    <section
      ref={paneRef}
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

      <Conditional when={isArchived}>
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('warehouses.archived.alertTitle')}</Alert.Title>
            <Alert.Description>
              {t('warehouses.archived.alertDescription')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>

      {/*
        The drawn order of the pane: the name, then the Delivery address, then
        the people with access, and the lifecycle row last — ruled off from one
        another rather than only spaced apart (`design-handoff.md` frame
        `e12gwk`, preview `warehouse-address-desktop-v1.html`).
      */}
      <WarehouseNameForm warehouse={warehouse} />

      <WarehouseDeliveryAddressSection warehouse={warehouse} />

      {peoplePanel}

      <WarehouseLifecycleActions
        isOnlyNonArchived={isOnlyNonArchived}
        warehouse={warehouse}
      />
    </section>
  );
};
