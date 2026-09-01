import { Button, Modal } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useUnfulfilledCustomerOrdersByItem } from 'modules/customer-order/hooks/queries/useUnfulfilledCustomerOrdersByItem';
import { useAddPurchaseDraftLineLinkMutation } from 'modules/purchase-draft/api/purchase-draft-api';
import { LinkCustomerOrderDialog } from 'modules/purchase-draft/components/purchase-draft-line-links/components/LinkCustomerOrderDialog';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type {
  PurchaseDraftLine,
  PurchaseDraftLineLinkCreate,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type LinkCustomerOrderActionProps = {
  /** Which line of the draft this is, as the frames number them from 1. */
  index: number;
  line: PurchaseDraftLine;
  purchaseDraftId: string;
};

/**
 * The `+ Link a customer order` workflow, whole (frame `yGhkK`): its
 * Permission gate, the trigger, the dialog it opens and the request it runs —
 * the same shape as `AddPurchaseDraftLineAction`.
 *
 * **Only this line's own demand is offered.** A link says how much of *this*
 * line is intended for a customer, so the orders offered are the Unfulfilled
 * Customer Orders placed for the same Item (AC-04, AC-17a) — a Fulfilled or
 * cancelled order is never linkable demand, and an order for another Item is
 * not what this line serves. Orders of another Warehouse are not reachable at
 * all, because the read is scoped to the entered Warehouse (AC-11).
 *
 * **The demand is read here rather than inside the dialog**, which is the one
 * place this workflow departs from the usual "read it where the dialog opens"
 * shape. `TriggeredDialog` mounts the dialog only when the trigger is pressed,
 * so a read starting there would leave the picker empty for as long as the
 * request takes and would momentarily state that nothing is waiting for this
 * item — a false answer, shown at exactly the moment the member is deciding.
 * RTK Query deduplicates the subscription, so every line's action on the page
 * shares one request for the Warehouse's Unfulfilled Customer Orders rather
 * than issuing one apiece.
 *
 * It is rendered only for a draft still in the Draft state — the caller's
 * decision, because a frozen draft's links are part of the record of what the
 * supplier was told (AC-15) and a control that exists but refuses is worse than
 * one that was never offered. An archived Warehouse is the other case, and
 * there the opposite rule applies: the trigger stays **visible and disabled
 * with its reason**, because a member has to understand why the site they
 * belong to no longer accepts work (AC-23).
 */
export const LinkCustomerOrderAction = ({
  index,
  line,
  purchaseDraftId,
}: LinkCustomerOrderActionProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse();
  const { isArchived, reasonId } = useArchivedWarehouse();
  const customerOrdersByItem = useUnfulfilledCustomerOrdersByItem();
  const [addPurchaseDraftLineLink] = useAddPurchaseDraftLineLinkMutation();
  const label = t('lineLinks.addLink');

  const onSave = (
    input: PurchaseDraftLineLinkCreate,
  ): Promise<MutationResult> =>
    addPurchaseDraftLineLink({
      warehouseId: warehouseId ?? '',
      purchaseDraftId,
      purchaseDraftLineId: line.id,
      input,
    });

  return (
    <WarehousePermissionGate permission={PermissionId.PURCHASE_DRAFTS_UPDATE}>
      <Modal>
        <Button
          aria-describedby={reasonId}
          aria-label={label}
          isDisabled={isArchived}
          size="sm"
          variant="secondary"
        >
          {label}
        </Button>
        <TriggeredDialog>
          <LinkCustomerOrderDialog
            customerOrders={customerOrdersByItem[line.itemId] ?? []}
            index={index}
            unitOfMeasure={line.unitOfMeasure}
            onSave={onSave}
          />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
