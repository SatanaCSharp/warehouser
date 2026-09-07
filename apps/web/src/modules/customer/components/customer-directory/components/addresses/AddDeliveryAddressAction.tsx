import { Button, Modal } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useAddCustomerDeliveryAddressMutation } from 'modules/customer/api/customer-api';
import { AddDeliveryAddressDialog } from 'modules/customer/components/customer-directory/components/addresses/AddDeliveryAddressDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { PlusIcon } from 'shared/icons';

import type {
  Customer,
  CustomerDeliveryAddressCreate,
} from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type AddDeliveryAddressActionProps = {
  customer: Customer;
};

/**
 * The Add Delivery Address workflow, whole: its gate, the trigger, the dialog
 * and the mutation. An actor without `CUSTOMERS:UPDATE` gets no trigger at all
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`); an archived
 * Warehouse keeps it visible and disabled with its reason exposed (AC-23).
 *
 * It is also the way out of AC-07: the refusal a member meets when
 * deactivating a Customer's last active address tells them to add the
 * replacement first, and this is the control that sentence points at
 * (`okRzd` tile `pb4Yx`).
 */
export const AddDeliveryAddressAction = ({
  customer,
}: AddDeliveryAddressActionProps): ReactElement => {
  const { t } = useTranslation('customer');
  const warehouseId = useEnteredWarehouse();
  const { isArchived, reasonId } = useArchivedWarehouse();
  const [addAddress] = useAddCustomerDeliveryAddressMutation();
  const label = t('detail.addresses.addAction');

  const onSave = (
    input: CustomerDeliveryAddressCreate,
  ): Promise<MutationResult> =>
    addAddress({
      customerName: customer.name,
      warehouseId: warehouseId ?? '',
      customerId: customer.id,
      input,
    });

  return (
    <WarehousePermissionGate permission={PermissionId.CUSTOMERS_UPDATE}>
      <Modal>
        <Button
          size="sm"
          variant="ghost"
          aria-label={label}
          aria-describedby={reasonId}
          isDisabled={isArchived}
        >
          <PlusIcon />
          {label}
        </Button>
        <TriggeredDialog>
          <AddDeliveryAddressDialog onSave={onSave} />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
