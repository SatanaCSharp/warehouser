import { Button, Modal } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useConfirmPurchaseDraftArrivalMutation } from 'modules/purchase-draft/api/purchase-draft-api';
import { ConfirmArrivalDialog } from 'modules/purchase-draft/components/purchase-draft-transitions/components/confirm-arrival-dialog/ConfirmArrivalDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type {
  ArrivalConfirmation,
  PurchaseDraftDetail,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type ConfirmArrivalActionProps = {
  draft: PurchaseDraftDetail;
};

/**
 * Confirming an arrival, end to end (AC-17, AC-22): the one act that both
 * records what arrived and assigns it to named customers, and the one that
 * closes the draft for good.
 */
export const ConfirmArrivalAction = ({
  draft,
}: ConfirmArrivalActionProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse() ?? '';
  const [confirmPurchaseDraftArrival] =
    useConfirmPurchaseDraftArrivalMutation();

  const onSubmit = (input: ArrivalConfirmation): Promise<MutationResult> =>
    confirmPurchaseDraftArrival({
      warehouseId,
      purchaseDraftId: draft.id,
      input,
    });

  return (
    <WarehousePermissionGate permission={PermissionId.PURCHASE_DRAFTS_RECEIVE}>
      <Modal>
        <Button size="sm" variant="primary">
          {t('transitions.arrival.trigger')}
        </Button>
        <TriggeredDialog>
          <ConfirmArrivalDialog draft={draft} onSubmit={onSubmit} />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
