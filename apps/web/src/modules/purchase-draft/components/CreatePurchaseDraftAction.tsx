import { Button } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useCreatePurchaseDraftMutation } from 'modules/purchase-draft/api/purchase-draft-api';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type { ReactElement } from 'react';

/**
 * Starts a Purchase Draft (AC-10). An actor without `PURCHASE_DRAFTS:CREATE`
 * gets no trigger at all, matching `RecordDemandAction` and `CreateItemAction`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * There is no dialog because there is nothing to fill in: a draft is created
 * empty and then assembled line by line in the detail pane, so the Expected
 * Arrival Date — the one optional property `PurchaseDraftCreate` accepts — is
 * stated later through `revisePurchaseDraft` like every other draft property.
 * A dialog with no field would be a confirmation of a reversible, unsurprising
 * action, which `web-dialogs.md` §1 does not ask for.
 */
export const CreatePurchaseDraftAction = (): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse();
  const [createPurchaseDraft] = useCreatePurchaseDraftMutation();
  const label = t('workspace.newDraft');

  const onCreate = (): void => {
    void createPurchaseDraft({ warehouseId: warehouseId ?? '' });
  };

  // The request in flight is reported by the one global waiting affordance the
  // `pending.purchase-draft.createPurchaseDraft` registry entry raises, so this
  // control reads no readiness flag of its own (global-loader CR-AC-09).
  return (
    <WarehousePermissionGate permission={PermissionId.PURCHASE_DRAFTS_CREATE}>
      <Button variant="primary" aria-label={label} onPress={onCreate}>
        {label}
      </Button>
    </WarehousePermissionGate>
  );
};
