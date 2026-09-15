import { Button, Modal } from '@heroui/react';
import type { CustomerOrderCreate } from '@warehouser/contracts/customer-orders';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useRecordCustomerOrderMutation } from 'modules/customer-order/api/customer-order-api';
import { RecordCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/RecordCustomerOrderDialog';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

/**
 * The Record demand workflow, whole: its gate, the trigger, the dialog it
 * opens, and the mutation it runs. An actor without `CUSTOMER_ORDERS:CREATE`
 * gets no trigger at all (AC-01), matching `CreateItemAction`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * AC-23 — in an archived Warehouse the trigger stays **visible and disabled**
 * rather than vanishing, and points at the notice that states why
 * (`ArchivedWarehouseNotice`, rendered once by `DemandDirectory`). That is not
 * the same question as the Permission above it: archiving withdraws what the
 * Warehouse accepts rather than narrowing what the Role permits, so it is read
 * as a value here rather than expressed as a gate
 * (`shared/hooks/projections/useArchivedWarehouse.ts`).
 */
export const RecordDemandAction = (): ReactElement => {
  const { t } = useTranslation('customer-order');
  const warehouseId = useEnteredWarehouse();
  const { isArchived, reasonId } = useArchivedWarehouse();
  const [recordCustomerOrder] = useRecordCustomerOrderMutation();
  const label = t('demand.recordAction');

  const onSave = (input: CustomerOrderCreate): Promise<MutationResult> =>
    recordCustomerOrder({ warehouseId: warehouseId ?? '', input });

  return (
    <WarehousePermissionGate permission={PermissionId.CUSTOMER_ORDERS_CREATE}>
      <Modal>
        <Button
          aria-describedby={reasonId}
          aria-label={label}
          isDisabled={isArchived}
          variant="primary"
        >
          {label}
        </Button>
        <TriggeredDialog>
          <RecordCustomerOrderDialog onSave={onSave} />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
