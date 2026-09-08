import { Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { useAmendPurchaseDraftLineRejectionMutation } from 'modules/purchase-draft/api/purchase-draft-api';
import { AmendRefusalDialog } from 'modules/purchase-draft/components/closed-purchase-draft-line/components/AmendRefusalDialog';
import { PurchaseDraftLineConditionSummary } from 'modules/purchase-draft/components/closed-purchase-draft-line/components/PurchaseDraftLineConditionSummary';
import { PurchaseDraftLineRefusalRow } from 'modules/purchase-draft/components/closed-purchase-draft-line/components/PurchaseDraftLineRefusalRow';
import { PurchaseDraftLineDestination } from 'modules/purchase-draft/components/purchase-draft-line-delivery/components/PurchaseDraftLineDestination';
import { PurchaseDraftLineLinks } from 'modules/purchase-draft/components/purchase-draft-line-links/PurchaseDraftLineLinks';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { Conditional } from 'shared/components/Conditional';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';
import { CircleCheckIcon, CircleXIcon, ClipboardCheckIcon } from 'shared/icons';

import type {
  DeliveryMode,
  EndingKind,
  LineCondition,
  PackagingType,
  PreReceiptConformanceVerdict,
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

/** Which figure the summary's second cell reads — "PRESENTED" for what
 * arrived at the dock, "DELIVERED" for what the customer received. */
const SUMMARY_KIND: Record<EndingKind, 'arrival' | 'directDelivery'> = {
  arrival: 'arrival',
  direct_delivery: 'directDelivery',
};

/**
 * The `CONDITION ON ARRIVAL` heading, read from the approved frame `MaRvu`
 * itself (`previews/closed-draft-desktop-v1.html:274,345` — review evidence,
 * consulted because no other approved artifact states this surface's exact
 * copy): both delivery modes carry the **identical** heading text on a
 * closed line — the Source chip beside it, not the heading, is what tells a
 * direct-delivery ending apart from one recorded at the dock. This is a
 * closed-line-only reading; it neither reuses nor derives from the ending
 * dialog's own `ConditionBlock` heading (`CONDITION` /
 * `CONDITION, AS THE CUSTOMER REPORTED IT`), which exists only while an
 * ending is being composed.
 */
const CONDITION_HEADING_KEY: Record<EndingKind, string> = {
  arrival: 'closedLine.conditionHeading.arrival',
  direct_delivery: 'closedLine.conditionHeading.direct_delivery',
};

const VERDICT_ICON: Record<PreReceiptConformanceVerdict, ReactElement> = {
  met: <CircleCheckIcon />,
  not_met: <CircleXIcon />,
  not_applicable: <ClipboardCheckIcon />,
};

const VERDICT_TONE: Record<PreReceiptConformanceVerdict, string> = {
  met: 'bg-success-soft text-success-soft-foreground',
  not_met: 'bg-danger-soft text-danger-soft-foreground',
  not_applicable: 'bg-surface-secondary text-muted',
};

/** How this line's goods travel, as a total lookup so a third Delivery Mode
 * fails to compile here until it is given a chip (`writing-web-components.md`
 * §6) — the same table `PurchaseDraftLineEditor` keys its own chip by. */
const MODE_CHIP_COLOR: Record<DeliveryMode, 'default' | 'accent'> = {
  via_warehouse: 'default',
  direct_to_customer: 'accent',
};

type ConditionOnArrivalSectionProps = {
  condition: LineCondition;
  endingKind: EndingKind;
  itemSku: string;
  orderedQuantity: number;
  presentedQuantity: number;
  onAmend: (subject: PurchaseDraftLineRejection) => void;
};

/**
 * The `CONDITION ON ARRIVAL` block, rendered only once `condition` is known
 * to exist — its props only exist under that condition, so it is resolved to
 * a single element before the return rather than reached through a ternary
 * (`shared/components/Conditional` doc comment, `writing-web-components.md`
 * §6).
 *
 * **AC-22 leaves no trace.** `rejections` is a property of
 * `LineConditionWithCause` alone: on the withheld shape it is absent, not
 * empty, so the refusal list simply never renders — not as an empty list, not
 * as a disabled one. The one total refused figure comes from
 * `condition.rejectedQuantity`, which both shapes carry, so the fact of a
 * refusal is never itself withheld (spec.md §6.1 abuse cases).
 */
const ConditionOnArrivalSection = ({
  condition,
  endingKind,
  itemSku,
  orderedQuantity,
  presentedQuantity,
  onAmend,
}: ConditionOnArrivalSectionProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const rejections =
    'rejections' in condition ? condition.rejections : undefined;
  const { verdict } = condition.preReceiptConformance;

  const explanation: Record<PreReceiptConformanceVerdict, string> = {
    met: t('closedLine.conformance.explanation.met'),
    not_applicable: t('closedLine.conformance.explanation.notApplicable'),
    // Non-null only under `not_met`
    // (`chk_purchase_draft_lines_conformance_note_shape`) — the member's own
    // recorded note, never canned copy.
    not_met: condition.preReceiptConformance.note ?? '',
  };

  return (
    <section
      aria-label={t(CONDITION_HEADING_KEY[endingKind])}
      className="mt-3 flex w-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
    >
      {/* No line-level Source chip here (unlike the ending dialog's own
          `ConditionBlock` header): Source is a property of each Rejection
          record, not of the ending, and a chip naming it here regardless of
          cause would leak that a refusal is `inspected`/`customer_reported`
          even in the AC-22 withheld shape — the same trace this component
          must never leave. Each `PurchaseDraftLineRefusalRow` states its own
          Source instead, exactly where the wire carries one. */}
      <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {t(CONDITION_HEADING_KEY[endingKind])}
      </p>

      <PurchaseDraftLineConditionSummary
        accepted={condition.acceptedQuantity}
        itemSku={itemSku}
        kind={SUMMARY_KIND[endingKind]}
        ordered={orderedQuantity}
        presented={presentedQuantity}
        refused={condition.rejectedQuantity}
      />

      <Conditional when={rejections && rejections.length > 0}>
        <ul className="flex w-full flex-col gap-2">
          {(rejections ?? []).map((rejection) => (
            <PurchaseDraftLineRefusalRow
              key={rejection.id}
              rejection={rejection}
              onAmend={onAmend}
            />
          ))}
        </ul>
      </Conditional>

      <div
        className={`flex w-full items-start gap-2.5 rounded-2xl px-3.5 py-2.5 ${VERDICT_TONE[verdict]}`}
      >
        <span className="mt-0.5 shrink-0">{VERDICT_ICON[verdict]}</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[13px] font-semibold text-foreground">
            {t(`closedLine.conformance.verdict.${verdict}`)}
          </p>
          <p className="text-xs leading-relaxed text-muted">
            {explanation[verdict]}
          </p>
        </div>
      </div>
    </section>
  );
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
