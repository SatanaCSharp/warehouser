import { AlertDialog, Button } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useDiscardPurchaseDraftMutation } from 'modules/purchase-draft/api/purchase-draft-api';
import { DiscardPurchaseDraftDialog } from 'modules/purchase-draft/components/purchase-draft-transitions/components/DiscardPurchaseDraftDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { PurchaseDraftDetail } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type DiscardPurchaseDraftActionProps = {
  draft: PurchaseDraftDetail;
};

/**
 * Discarding a draft that was never made ready, end to end (AC-24, AC-22).
 * Only a draft still in the Draft state is offered this act at all, which is
 * `PurchaseDraftTransitions`' decision (AC-24a).
 */
export const DiscardPurchaseDraftAction = ({
  draft,
}: DiscardPurchaseDraftActionProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse() ?? '';
  const [discardPurchaseDraft] = useDiscardPurchaseDraftMutation();

  const onConfirm = (): Promise<MutationResult> =>
    discardPurchaseDraft({ warehouseId, purchaseDraftId: draft.id });

  return (
    <WarehousePermissionGate permission={PermissionId.PURCHASE_DRAFTS_DISCARD}>
      <AlertDialog>
        <Button size="sm" variant="outline">
          {t('transitions.discard.trigger')}
        </Button>
        <TriggeredDialog>
          <DiscardPurchaseDraftDialog onConfirm={onConfirm} />
        </TriggeredDialog>
      </AlertDialog>
    </WarehousePermissionGate>
  );
};
