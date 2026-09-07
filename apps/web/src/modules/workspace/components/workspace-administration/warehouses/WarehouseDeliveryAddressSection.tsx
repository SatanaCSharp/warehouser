import { Separator } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useGetWarehouseDeliveryAddressQuery } from 'modules/workspace/api/warehouse-api';
import { WarehouseDeliveryAddressForm } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseDeliveryAddressForm';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
import { useHasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { ReactNode } from 'react';

type WarehouseDeliveryAddressSectionProps = { warehouse: Warehouse };

/**
 * The Warehouse's own Delivery Address, between the warehouse-name form and
 * the people list of the detail pane (AC-10, `design-handoff.md` frame
 * `e12gwk`).
 *
 * Its subject is the Warehouse record, so the Permission that admits it is a
 * **Workspace** Permission, and the whole section is withheld — absent, not
 * disabled — from a member who does not hold it
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * The same Permission is read as a boolean here for the one purpose that ADR
 * allows one: a dataset the actor may not read is never requested. The gate
 * decides the markup; the `skip` decides the request, and both are named in
 * this file rather than travelling anywhere as a prop.
 *
 * The recorded address seeds the form's fields, which HeroUI's `TextField`
 * takes as a `defaultValue` — so the form is remounted by `key` once the read
 * lands rather than mirrored into state and repaired with an effect
 * (writing-web-components.md §9).
 */
export const WarehouseDeliveryAddressSection = ({
  warehouse,
}: WarehouseDeliveryAddressSectionProps): ReactNode => {
  const { t } = useTranslation('warehouse');
  const canUpdateAddress = useHasWorkspacePermission(
    WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
  );
  const { data: recorded } = useGetWarehouseDeliveryAddressQuery(warehouse.id, {
    skip: !canUpdateAddress,
  });

  return (
    <WorkspacePermissionGate
      permission={WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE}
    >
      {/*
        The rule that separates this block from the name field above it is the
        block's own, not the pane's: the section is withheld entirely from a
        member without the Permission, and a rule left behind in the pane would
        divide nothing (`warehouse-address-desktop-v1.html`).
      */}
      <Separator />
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">
            {t('warehouses.deliveryAddress.title')}
          </h3>
          <p className="text-xs leading-relaxed text-muted">
            {t('warehouses.deliveryAddress.description')}
          </p>
        </div>
        <WarehouseDeliveryAddressForm
          key={recorded?.addressText ?? 'unrecorded'}
          recorded={recorded}
          warehouse={warehouse}
        />
      </section>
    </WorkspacePermissionGate>
  );
};
