import { Button, Modal } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useCreateItemMutation } from 'modules/item/api/item-api';
import { CreateItemDialog } from 'modules/item/components/item-directory/components/CreateItemDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { ItemCreate } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/**
 * The Create Item workflow, whole: its gate, the trigger, the dialog it
 * opens, and the mutation it runs. An actor without `ITEMS:CREATE` gets no
 * trigger at all (AC-06), matching `CreateMemberAction`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const CreateItemAction = (): ReactElement => {
  const { t } = useTranslation('item');
  const warehouseId = useEnteredWarehouse();
  const [createItem] = useCreateItemMutation();
  const label = t('directory.createAction');

  const onSave = (input: ItemCreate): Promise<MutationResult> =>
    createItem({ warehouseId: warehouseId ?? '', input });

  return (
    <WarehousePermissionGate permission={PermissionId.ITEMS_CREATE}>
      <Modal>
        <Button variant="primary" aria-label={label}>
          {label}
        </Button>
        <TriggeredDialog>
          <CreateItemDialog onSave={onSave} />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
