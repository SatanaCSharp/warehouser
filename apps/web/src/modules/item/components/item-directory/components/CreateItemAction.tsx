import { Button, Modal } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useCreateItemMutation } from 'modules/item/api/item-api';
import { CreateItemDialog } from 'modules/item/components/item-directory/components/CreateItemDialog';
import { useItems } from 'modules/item/hooks/queries/useItems';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { PlusIcon } from 'shared/icons';

import type { ItemCreate } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/**
 * The Create Item workflow, whole: its gate, the trigger, the dialog it
 * opens, and the mutation it runs. An actor without `ITEMS:CREATE` gets no
 * trigger at all (AC-06), matching `CreateMemberAction`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * In an archived Warehouse the trigger stays on screen and is disabled, with
 * `aria-describedby` pointing at the one sentence `ArchivedWarehouseNotice`
 * renders for the destination (AC-23, frame `hWFRW` tile `TPZTI`) — a member
 * has to understand why the site they belong to no longer accepts work, which
 * a vanished button cannot tell them.
 *
 * It reads the catalogue itself rather than being handed it: the SKU conflict
 * AC-07 refuses has to name the Item that already holds the SKU, and routing
 * that list down from the destination would be a third hop
 * (`writing-web-components.md` §4).
 */
export const CreateItemAction = (): ReactElement => {
  const { t } = useTranslation('item');
  const warehouseId = useEnteredWarehouse();
  const { isArchived, reasonId } = useArchivedWarehouse();
  const items = useItems();
  const [createItem] = useCreateItemMutation();
  const label = t('directory.createAction');

  const onSave = (input: ItemCreate): Promise<MutationResult> =>
    createItem({ warehouseId: warehouseId ?? '', input });

  return (
    <WarehousePermissionGate permission={PermissionId.ITEMS_CREATE}>
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
          <CreateItemDialog items={items} onSave={onSave} />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
