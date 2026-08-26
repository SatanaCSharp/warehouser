import { Button, Modal } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useRecordCustomerOrderMutation } from 'modules/customer-order/api/customer-order-api';
import { RecordCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/RecordCustomerOrderDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { CustomerOrderCreate } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/**
 * The Record demand workflow, whole: its gate, the trigger, the dialog it
 * opens, and the mutation it runs. An actor without `CUSTOMER_ORDERS:CREATE`
 * gets no trigger at all (AC-01), matching `CreateItemAction`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const RecordDemandAction = (): ReactElement => {
  const { t } = useTranslation('customer-order');
  const warehouseId = useEnteredWarehouse();
  const [recordCustomerOrder] = useRecordCustomerOrderMutation();
  const label = t('demand.recordAction');

  const onSave = (input: CustomerOrderCreate): Promise<MutationResult> =>
    recordCustomerOrder({ warehouseId: warehouseId ?? '', input });

  return (
    <WarehousePermissionGate permission={PermissionId.CUSTOMER_ORDERS_CREATE}>
      <Modal>
        <Button variant="primary" aria-label={label}>
          {label}
        </Button>
        <TriggeredDialog>
          <RecordCustomerOrderDialog onSave={onSave} />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
