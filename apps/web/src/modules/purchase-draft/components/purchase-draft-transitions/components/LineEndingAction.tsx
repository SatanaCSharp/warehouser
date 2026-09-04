import { Button, Modal } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import {
  useRecordPurchaseDraftLineArrivalMutation,
  useRecordPurchaseDraftLineDirectDeliveryMutation,
} from 'modules/purchase-draft/api/purchase-draft-api';
import { LineEndingDialog } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/LineEndingDialog';
import {
  parseLineArrivalForm,
  parseLineDirectDeliveryForm,
} from 'modules/purchase-draft/utils/line-ending-form';
import { Conditional } from 'shared/components/Conditional';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type {
  PurchaseDraftDetail,
  PurchaseDraftLine,
  PurchaseDraftLineArrival,
  PurchaseDraftLineDirectDelivery,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type LineEndingActionProps = {
  draft: PurchaseDraftDetail;
  line: PurchaseDraftLine;
};

/**
 * The end of one line, end to end (AC-19, AC-20, AC-20a, AC-22).
 *
 * **This is where AC-20 is enforced in the UI, and it is enforced by absence.**
 * The two acts are two endpoints because the kind is a routing fact (ADR 0002),
 * and this component offers exactly the one the line's own Delivery Mode
 * admits — a dock arrival on a Via Warehouse line, a direct delivery on a
 * Direct to Customer one. The other is not disabled, not hidden behind a
 * validation message: it does not exist for this line. The server refuses it
 * regardless, and `EndingRefusalAlert` explains that refusal when a stale view
 * submits one anyway.
 *
 * **AC-20a is enforced the same way.** A line whose ending is already recorded
 * offers no second one; in its place it states the ending it carries — the
 * kind, the quantity and when — because "no button here" is not an answer a
 * member can act on. A second attempt is still possible from a stale view and
 * is still refused by the server, naming when and by whom.
 *
 * The mapping from mode to the act it admits is a total
 * `Record<DeliveryMode, ReactElement>`, not an `if`/`else` or a ternary ladder
 * (`writing-web-components.md` §6): a third Delivery Mode would fail to compile
 * here rather than silently render nothing.
 */
export const LineEndingAction = ({
  draft,
  line,
}: LineEndingActionProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse() ?? '';
  const { isArchived, reasonId } = useArchivedWarehouse();
  const { quantity } = useLocaleFormat();
  const [recordArrival] = useRecordPurchaseDraftLineArrivalMutation();
  const [recordDirectDelivery] =
    useRecordPurchaseDraftLineDirectDeliveryMutation();

  const onRecordArrival = (
    input: PurchaseDraftLineArrival,
  ): Promise<MutationResult> =>
    recordArrival({
      warehouseId,
      purchaseDraftId: draft.id,
      purchaseDraftLineId: line.id,
      input,
    });

  const onRecordDirectDelivery = (
    input: PurchaseDraftLineDirectDelivery,
  ): Promise<MutationResult> =>
    recordDirectDelivery({
      warehouseId,
      purchaseDraftId: draft.id,
      purchaseDraftLineId: line.id,
      input,
    });

  const endingTrigger = (
    kind: 'arrival' | 'directDelivery',
    dialog: ReactElement,
  ): ReactElement => (
    <Modal>
      <Button
        aria-describedby={reasonId}
        isDisabled={isArchived}
        size="sm"
        variant="primary"
      >
        {t(`transitions.lineEnding.${kind}.trigger`)}
      </Button>
      <TriggeredDialog>{dialog}</TriggeredDialog>
    </Modal>
  );

  // Total by construction: every Delivery Mode names the one act it admits.
  const offer: Record<PurchaseDraftLine['deliveryMode'], ReactElement> = {
    via_warehouse: endingTrigger(
      'arrival',
      <LineEndingDialog
        draft={draft}
        kind="arrival"
        line={line}
        parse={parseLineArrivalForm(line)}
        onSubmit={onRecordArrival}
      />,
    ),
    direct_to_customer: endingTrigger(
      'directDelivery',
      <LineEndingDialog
        draft={draft}
        kind="directDelivery"
        line={line}
        parse={parseLineDirectDeliveryForm(line)}
        onSubmit={onRecordDirectDelivery}
      />,
    ),
  };

  return (
    <WarehousePermissionGate permission={PermissionId.PURCHASE_DRAFTS_RECEIVE}>
      <Conditional
        when={line.ending === null}
        otherwise={
          <p className="text-sm text-muted">
            {t(
              `transitions.lineEnding.recorded.${line.ending?.kind ?? 'arrival'}`,
              {
                count: line.ending?.quantity ?? 0,
                formatted: quantity(line.ending?.quantity ?? 0),
              },
            )}
          </p>
        }
      >
        {offer[line.deliveryMode]}
      </Conditional>
    </WarehousePermissionGate>
  );
};
