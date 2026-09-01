import { Button, Modal } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useClosePurchaseDraftMutation } from 'modules/purchase-draft/api/purchase-draft-api';
import { ClosePurchaseDraftDialog } from 'modules/purchase-draft/components/purchase-draft-transitions/components/ClosePurchaseDraftDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type {
  PurchaseDraftClosure,
  PurchaseDraftDetail,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type ClosePurchaseDraftActionProps = {
  draft: PurchaseDraftDetail;
};

/**
 * Closing a frozen draft the supplier cannot fulfil, end to end (AC-21,
 * AC-22). A reason is filled in, so its dialog is a form and the root that
 * owns the open state is `Modal` rather than `AlertDialog`
 * (`docs/system/guides/web-dialogs.md` §5).
 */
export const ClosePurchaseDraftAction = ({
  draft,
}: ClosePurchaseDraftActionProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse() ?? '';
  const { isArchived, reasonId } = useArchivedWarehouse();
  const [closePurchaseDraft] = useClosePurchaseDraftMutation();

  const onSubmit = (input: PurchaseDraftClosure): Promise<MutationResult> =>
    closePurchaseDraft({ warehouseId, purchaseDraftId: draft.id, input });

  return (
    <WarehousePermissionGate permission={PermissionId.PURCHASE_DRAFTS_CLOSE}>
      <Modal>
        <Button
          aria-describedby={reasonId}
          isDisabled={isArchived}
          size="sm"
          variant="outline"
        >
          {t('transitions.close.trigger')}
        </Button>
        <TriggeredDialog>
          <ClosePurchaseDraftDialog
            reference={draft.reference}
            onSubmit={onSubmit}
          />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
