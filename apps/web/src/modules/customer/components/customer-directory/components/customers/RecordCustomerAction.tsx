import { Button, Modal } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useRecordCustomerMutation } from 'modules/customer/api/customer-api';
import { RecordCustomerDialog } from 'modules/customer/components/customer-directory/components/customers/RecordCustomerDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { PlusIcon } from 'shared/icons';

import type { CustomerCreate } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/**
 * The Record Customer workflow, whole: its gate, the trigger, the dialog it
 * opens, and the mutation it runs. An actor without `CUSTOMERS:CREATE` gets no
 * trigger at all — absent, never disabled
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * In an archived Warehouse the trigger stays on screen and is disabled, with
 * `aria-describedby` pointing at the one sentence `ArchivedWarehouseNotice`
 * renders for the destination (AC-23): a member has to understand why the site
 * they belong to no longer accepts work, which a vanished button cannot tell
 * them.
 */
export const RecordCustomerAction = (): ReactElement => {
  const { t } = useTranslation('customer');
  const warehouseId = useEnteredWarehouse();
  const { isArchived, reasonId } = useArchivedWarehouse();
  const [recordCustomer] = useRecordCustomerMutation();
  const label = t('directory.recordAction');

  const onSave = (input: CustomerCreate): Promise<MutationResult> =>
    recordCustomer({ warehouseId: warehouseId ?? '', input });

  return (
    <WarehousePermissionGate permission={PermissionId.CUSTOMERS_CREATE}>
      <Modal>
        <Button
          variant="primary"
          aria-label={label}
          aria-describedby={reasonId}
          isDisabled={isArchived}
        >
          <PlusIcon />
          {label}
        </Button>
        <TriggeredDialog>
          <RecordCustomerDialog onSave={onSave} />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
