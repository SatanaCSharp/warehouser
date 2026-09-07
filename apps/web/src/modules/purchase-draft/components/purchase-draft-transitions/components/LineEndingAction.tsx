import { Button, Chip, Modal } from '@heroui/react';
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
  EndingKind,
  PurchaseDraftDetail,
  PurchaseDraftLine,
  PurchaseDraftLineArrival,
  PurchaseDraftLineDirectDelivery,
  PurchaseDraftLineEnding,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/**
 * What an ending act needs to know about the draft it belongs to — its
 * identity, its reference for the dialog's title, its own lifecycle state,
 * and the lines `EndingRefusalAlert` resolves a bound violation's line number
 * or customer name against. The by-line view's own read
 * (`PurchaseDraftLineListEntry`) carries every one of these already, so this
 * is the narrowest contract that lets it reuse this action without fetching a
 * second, full `PurchaseDraftDetail` it has no other use for
 * (`writing-web-components.md` §5).
 */
export type LineEndingDraft = Pick<
  PurchaseDraftDetail,
  'id' | 'reference' | 'state' | 'lines'
>;

export type LineEndingActionProps = {
  draft: LineEndingDraft;
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
 * **It gates itself on the draft's own state.** A line is offered an ending
 * only while the draft is frozen, and the component answers that question
 * rather than taking a visibility flag or leaving its caller a ternary
 * (`writing-web-components.md` §6).
 *
 * The mapping from mode to the act it admits is a total
 * `Record<DeliveryMode, ReactElement>`, not an `if`/`else` or a ternary ladder
 * (`writing-web-components.md` §6): a third Delivery Mode would fail to compile
 * here rather than silently render nothing.
 */
export const LineEndingAction = ({
  draft,
  line,
}: LineEndingActionProps): ReactElement | null => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse() ?? '';
  const { isArchived, reasonId } = useArchivedWarehouse();
  const { quantity, shortTimestampDate } = useLocaleFormat();
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

  // Total by construction: every ending kind names what it says once recorded,
  // so a third kind fails to compile here rather than falling through to a
  // key that resolves to nothing (`writing-web-components.md` §6).
  const recordedLabel = (ending: PurchaseDraftLineEnding): string => {
    const values = {
      count: ending.quantity,
      formatted: quantity(ending.quantity),
      on: shortTimestampDate(ending.recordedAt),
    };
    const label: Record<EndingKind, string> = {
      arrival: t('transitions.lineEnding.recorded.arrival', values),
      direct_delivery: t(
        'transitions.lineEnding.recorded.direct_delivery',
        values,
      ),
    };

    return label[ending.kind];
  };

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

  // AC-19 — a line ends only once the draft is frozen, and each line ends on
  // its own day. A draft still in `draft` has nothing to end; a Closed one has
  // already ended every line it holds. The component answers that itself, so
  // no caller carries a visibility branch for it
  // (`writing-web-components.md` §6).
  if (draft.state !== 'ready_for_ordering') {
    return null;
  }

  // The chip reads the ending the line carries, so it is resolved here rather
  // than gated inline — `Conditional` builds both arms
  // (`writing-web-conditional-components.md` §2). Resolving it is what types
  // the ending non-nullable where its copy is written, so no placeholder kind
  // or quantity can stand in for one that is not there.
  //
  // **It is a success chip carrying the day, not a muted sentence** (`zj46c`
  // `Delivered 28 Aug`, `F0SpRx` `Arrived … · 26 Aug`): a recorded ending is
  // the resolved outcome of the line, and the by-line table's `ENDING` column
  // has to be readable at a glance. `recordedAt` is on the ending itself, so
  // the day costs no second read. The chip states its own kind in words, so
  // `success` is never the thing carrying the meaning
  // (design-handoff.md §Accessibility).
  const recorded =
    line.ending === null ? null : (
      <Chip color="success" size="sm" variant="soft">
        {recordedLabel(line.ending)}
      </Chip>
    );

  return (
    <WarehousePermissionGate permission={PermissionId.PURCHASE_DRAFTS_RECEIVE}>
      <Conditional otherwise={recorded} when={line.ending === null}>
        {offer[line.deliveryMode]}
      </Conditional>
    </WarehousePermissionGate>
  );
};
