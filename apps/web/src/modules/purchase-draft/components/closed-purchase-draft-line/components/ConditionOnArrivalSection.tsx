import { Alert } from '@heroui/react';
import type {
  EndingKind,
  LineCondition,
  PreReceiptConformanceVerdict,
  PurchaseDraftLineRejection,
} from '@warehouser/contracts/purchase-drafts';
import { PurchaseDraftLineConditionSummary } from 'modules/purchase-draft/components/closed-purchase-draft-line/components/PurchaseDraftLineConditionSummary';
import { PurchaseDraftLineRefusalRow } from 'modules/purchase-draft/components/closed-purchase-draft-line/components/PurchaseDraftLineRefusalRow';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';
import { CircleCheckIcon, CircleXIcon, ClipboardCheckIcon } from 'shared/icons';

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

/**
 * Which tone HeroUI paints the conformance judgement in. `Alert` owns the
 * background, border and foreground for each status, so this names the meaning
 * and nothing about the colour — the soft-token class pair this replaced was a
 * visual-only override of exactly what a status already communicates
 * (`heroui-design-principles.md` §1, §9).
 */
const VERDICT_STATUS: Record<
  PreReceiptConformanceVerdict,
  'success' | 'danger' | 'default'
> = {
  met: 'success',
  not_met: 'danger',
  not_applicable: 'default',
};

export type ConditionOnArrivalSectionProps = {
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
export const ConditionOnArrivalSection = ({
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

      <Alert status={VERDICT_STATUS[verdict]}>
        <Alert.Indicator>{VERDICT_ICON[verdict]}</Alert.Indicator>
        <Alert.Content>
          <Alert.Title>
            {t(`closedLine.conformance.verdict.${verdict}`)}
          </Alert.Title>
          <Alert.Description>{explanation[verdict]}</Alert.Description>
        </Alert.Content>
      </Alert>
    </section>
  );
};
