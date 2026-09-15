import { AlertDialog, Button } from '@heroui/react';
import type { PurchaseDraftDetail } from '@warehouser/contracts/purchase-drafts';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useReadyPurchaseDraftMutation } from 'modules/purchase-draft/api/purchase-draft-api';
import { ReadyPurchaseDraftDialog } from 'modules/purchase-draft/components/purchase-draft-transitions/components/ReadyPurchaseDraftDialog';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

export type ReadyPurchaseDraftActionProps = {
  draft: PurchaseDraftDetail;
};

/**
 * Moving a draft to Ready for Ordering, end to end: the Permission that offers
 * it, the trigger, the dialog it opens and the request it runs (AC-14, AC-22).
 * The `AlertDialog` root owns whether the dialog is open and returns focus to
 * the trigger when it closes, so nothing here tracks that
 * (`writing-web-components.md` §3, §8).
 *
 * AC-23 — in an archived Warehouse the trigger stays **visible and disabled
 * with its reason**, never withheld: a member has to understand why the site
 * they belong to no longer accepts work.
 */
export const ReadyPurchaseDraftAction = ({
  draft,
}: ReadyPurchaseDraftActionProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse() ?? '';
  const { isArchived, reasonId } = useArchivedWarehouse();
  const [readyPurchaseDraft] = useReadyPurchaseDraftMutation();

  const onConfirm = (): Promise<MutationResult> =>
    readyPurchaseDraft({ warehouseId, purchaseDraftId: draft.id });

  return (
    <WarehousePermissionGate permission={PermissionId.PURCHASE_DRAFTS_READY}>
      <AlertDialog>
        <Button
          aria-describedby={reasonId}
          isDisabled={isArchived}
          size="sm"
          variant="primary"
        >
          {t('transitions.ready.trigger')}
        </Button>
        <TriggeredDialog>
          <ReadyPurchaseDraftDialog
            lineCount={draft.lines.length}
            reference={draft.reference}
            onConfirm={onConfirm}
          />
        </TriggeredDialog>
      </AlertDialog>
    </WarehousePermissionGate>
  );
};
