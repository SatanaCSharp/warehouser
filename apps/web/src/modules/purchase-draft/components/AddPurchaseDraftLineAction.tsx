import { Button, Modal } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useAddPurchaseDraftLineMutation } from 'modules/purchase-draft/api/purchase-draft-api';
import { AddPurchaseDraftLineDialog } from 'modules/purchase-draft/components/AddPurchaseDraftLineDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { PurchaseDraftLineCreate } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type AddPurchaseDraftLineActionProps = {
  purchaseDraftId: string;
};

/**
 * The Add line workflow, whole: its gate, the trigger, the dialog it opens and
 * the mutation it runs — the same shape as `RecordDemandAction`.
 *
 * It is rendered only for a draft in the Draft state. That is the caller's
 * decision rather than a state check here, because the frozen states already
 * render their lines through the same list with `isFrozen`, and a control that
 * exists but refuses is worse than one that was never offered (AC-15).
 */
export const AddPurchaseDraftLineAction = ({
  purchaseDraftId,
}: AddPurchaseDraftLineActionProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse();
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
        <Button variant="secondary" aria-label={label}>
          {label}
        </Button>
        <TriggeredDialog>
          <AddPurchaseDraftLineDialog onSave={onSave} />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
