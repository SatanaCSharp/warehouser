import { Button, Modal } from '@heroui/react';
import type { PurchaseDraftLineCreate } from '@warehouser/contracts/purchase-drafts';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useAddPurchaseDraftLineMutation } from 'modules/purchase-draft/api/purchase-draft-api';
import { AddPurchaseDraftLineDialog } from 'modules/purchase-draft/components/AddPurchaseDraftLineDialog';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

type AddPurchaseDraftLineActionProps = {
  purchaseDraftId: string;
  /** The draft's human reference, which the dialog's title names it by. */
  reference: string;
};

/**
 * The Add line workflow, whole: its gate, the trigger, the dialog it opens and
 * the mutation it runs — the same shape as `RecordDemandAction`.
 *
 * It is rendered only for a draft in the Draft state. That is the caller's
 * decision rather than a state check here, because the frozen states already
 * render their lines through the same list with `isFrozen`, and a control that
 * exists but refuses is worse than one that was never offered (AC-15).
 *
 * An archived Warehouse is the opposite case (AC-23): the trigger stays
 * **visible and disabled with its reason**, because a member has to understand
 * why the site they belong to no longer accepts work.
 */
export const AddPurchaseDraftLineAction = ({
  purchaseDraftId,
  reference,
}: AddPurchaseDraftLineActionProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse();
  const { isArchived, reasonId } = useArchivedWarehouse();
  const [addPurchaseDraftLine] = useAddPurchaseDraftLineMutation();
  const label = t('detail.addLine');

  const onSave = (input: PurchaseDraftLineCreate): Promise<MutationResult> =>
    addPurchaseDraftLine({
      warehouseId: warehouseId ?? '',
      purchaseDraftId,
      input,
    });

  return (
    <WarehousePermissionGate permission={PermissionId.PURCHASE_DRAFTS_UPDATE}>
      <Modal>
        <Button
          aria-describedby={reasonId}
          aria-label={label}
          isDisabled={isArchived}
          variant="secondary"
        >
          {label}
        </Button>
        <TriggeredDialog>
          <AddPurchaseDraftLineDialog reference={reference} onSave={onSave} />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
