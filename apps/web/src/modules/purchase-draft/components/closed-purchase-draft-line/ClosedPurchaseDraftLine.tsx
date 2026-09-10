import { Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { useAmendPurchaseDraftLineRejectionMutation } from 'modules/purchase-draft/api/purchase-draft-api';
import { AmendRefusalDialog } from 'modules/purchase-draft/components/closed-purchase-draft-line/components/AmendRefusalDialog';
import { ConditionOnArrivalSection } from 'modules/purchase-draft/components/closed-purchase-draft-line/components/ConditionOnArrivalSection';
import { PurchaseDraftLineDestination } from 'modules/purchase-draft/components/purchase-draft-line-delivery/components/PurchaseDraftLineDestination';
import { PurchaseDraftLineLinks } from 'modules/purchase-draft/components/purchase-draft-line-links/PurchaseDraftLineLinks';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { Conditional } from 'shared/components/Conditional';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';

import type {
  DeliveryMode,
  LineCondition,
  PackagingType,
  PurchaseDraftLine,
  PurchaseDraftLineRejection,
  RejectionAmend,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type ClosedPurchaseDraftLineProps = {
  /** Which line of the draft this is, as the frames number them from 1. */
  index: number;
  line: PurchaseDraftLine;
  packagingTypes: PackagingType[];
  purchaseDraftId: string;
};

/** How this line's goods travel, as a total lookup so a third Delivery Mode
 * fails to compile here until it is given a chip (`writing-web-components.md`
 * §6) — the same table `PurchaseDraftLineEditor` keys its own chip by. */
const MODE_CHIP_COLOR: Record<DeliveryMode, 'default' | 'accent'> = {
  via_warehouse: 'default',
  direct_to_customer: 'accent',
};

/**
 * `Inspection/Closed Line` (`FYfEa`, T17): the read-only account of one
 * Purchase Draft Line on a closed draft, derived from the shipped
 * `Delivery/Draft Line` (`jnl1h`) — one component serving **both** Delivery
 * Modes, the direct-line rendering an instance override rather than a second
 * component. Adds the `CONDITION ON ARRIVAL` block between the value-adding
 * note and the links (AC-21, AC-22, AC-23, AC-23a).
 *
 * **Nothing here writes.** `PurchaseDraftLineList`'s existing row — the
 * editable/frozen `PurchaseDraftLineEditor` — stays the surface a draft
 * still being worked on renders; this component is a separate, read-only
 * reading of a *closed* line. The `SERVED, AS FROZEN` rows reuse the shipped
 * `PurchaseDraftLineLinks` unchanged, exactly as the component-mapping table
 * requires (`Ordering/Link Row`, `BSmrU`, "Reused ... for the closed line's
 * SERVED, AS FROZEN rows") — the same section `PurchaseDraftLineEditor`
 * already renders for a frozen or closed draft today, so this component
 * introduces no second reading of who a line serves. With `isFrozen` always
 * `true` here, every write it could offer is already disabled by
 * `refusesWrites`; the only native form control this component's own tree
 * renders is that shipped, permanently-disabled quantity field, and the
 * kebab is the refusal row's own, sole affordance.
 *
 * **The absent case renders nothing extra** (sad.md §7). A line whose ending
 * predates this release, or where nothing was received, carries
 * `ending.condition: null`; this component then renders neither the
 * condition block nor the conformance judgement.
 */
/** Which per-refusal dialog this closed line's own rows open — this
 * surface's own `Kind` union, shared with no other
 * (`docs/system/guides/web-action-dialogs.md`). */
type ClosedLineDialogKind = 'amendRefusal';

export const ClosedPurchaseDraftLine = ({
  index,
  line,
  packagingTypes,
  purchaseDraftId,
}: ClosedPurchaseDraftLineProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { quantity } = useLocaleFormat();
  const warehouseId = useEnteredWarehouse() ?? '';
  const [amendRejection] = useAmendPurchaseDraftLineRejectionMutation();
  const dialog = useActionDialog<
    ClosedLineDialogKind,
    PurchaseDraftLineRejection
  >();

  const onAmend = (subject: PurchaseDraftLineRejection): void =>
    dialog.open('amendRefusal', subject);

  const onSaveAmend =
    (subject: PurchaseDraftLineRejection) =>
    (input: RejectionAmend): Promise<MutationResult> =>
      amendRejection({
        warehouseId,
        purchaseDraftId,
        purchaseDraftLineId: line.id,
        rejectionId: subject.id,
        input,
      });

  const packagingTypeLabel = packagingTypes.find(
    (type) => type.id === line.packagingTypeId,
  )?.label;

  const condition: LineCondition | null = line.ending?.condition ?? null;

  const conditionSection =
    condition === null ? null : (
      <ConditionOnArrivalSection
        condition={condition}
        endingKind={line.ending?.kind ?? 'arrival'}
        itemSku={line.itemSku}
        orderedQuantity={line.orderedQuantity}
        presentedQuantity={line.ending?.quantity ?? 0}
        onAmend={onAmend}
      />
    );

  return (
    <li className="rounded-xl border border-border-secondary bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('lineEditor.heading', { index })}
        </p>
        <Chip
          color={MODE_CHIP_COLOR[line.deliveryMode]}
          size="sm"
          variant="soft"
        >
          {t(`lineDelivery.mode.${line.deliveryMode}`)}
        </Chip>
      </div>

      <div className="mt-3 flex flex-col gap-3 md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {t('lineEditor.item')}
          </span>
          <span className="text-sm leading-snug text-foreground">
            {t('lineEditor.itemOption', {
              sku: line.itemSku,
              description: line.itemDescription,
            })}
          </span>
        </div>
        <div className="flex flex-col gap-1 md:w-40">
          <span className="text-sm font-medium text-foreground">
            {t('lineEditor.quantity')}
          </span>
          <span className="text-sm font-semibold leading-snug text-foreground">
            {quantity(line.orderedQuantity)}
          </span>
          <span className="text-xs leading-snug text-muted">
            {line.unitOfMeasure}
          </span>
        </div>
        <div className="flex flex-col gap-1 md:w-48">
          <span className="text-sm font-medium text-foreground">
            {t('lineEditor.packagingType')}
          </span>
          <span className="text-sm leading-snug text-foreground">
            {packagingTypeLabel ?? t('lineEditor.packagingTypeNone')}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <PurchaseDraftLineDestination isFrozen line={line} />
      </div>

      <Conditional when={line.valueAddingNote}>
        <div className="mt-3 flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {t('lineEditor.valueAddingNote')}
          </span>
          <span className="break-words text-sm leading-snug text-foreground">
            {line.valueAddingNote}
          </span>
        </div>
      </Conditional>

      {conditionSection}

      <PurchaseDraftLineLinks
        index={index}
        isFrozen
        line={line}
        purchaseDraftId={purchaseDraftId}
      />

      <ActionDialogHost
        controller={dialog}
        renderDialogs={{
          amendRefusal: (subject) => (
            <AmendRefusalDialog
              rejection={subject}
              onSave={onSaveAmend(subject)}
            />
          ),
        }}
      />
    </li>
  );
};
