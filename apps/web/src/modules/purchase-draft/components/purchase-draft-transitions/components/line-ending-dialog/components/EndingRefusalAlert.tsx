import { Alert, Button } from '@heroui/react';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useLinkNaming } from 'modules/purchase-draft/hooks/projections/useLinkNaming';
import { endingBoundViolations } from 'modules/purchase-draft/utils/line-ending-form';
import { Conditional } from 'shared/components/Conditional';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { LineEndingDraft } from 'modules/purchase-draft/components/purchase-draft-transitions/components/LineEndingAction';
import type { EndingBoundViolation } from 'modules/purchase-draft/utils/line-ending-form';
import type { ReactElement } from 'react';

export type EndingRefusalAlertProps = {
  /** The stable code of the refusal, or nothing while none has been reported. */
  code?: string;
  /** The refusal's own safe envelope, which carries the bounds it broke. */
  details?: Record<string, unknown>;
  draft: LineEndingDraft;
  onDismiss: () => void;
};

/** One sentence naming one broken bound, keyed by the identifier it resolved. */
type BoundBullet = { key: string; text: string };

/** One violation entry of a T19 refusal, read defensively (rule fields differ per code). */
type Violation = Record<string, unknown>;

/** Which refusal the member is reading. */
type EndingRefusalState =
  | 'bounds'
  | 'alreadyRecorded'
  | 'modeMismatch'
  | 'invalidState'
  | 'conditionSplit'
  | 'conformance'
  | 'invalidInput'
  | 'unknown';

// A refusal names the rule the boundary applied; the member is told the rule,
// never the raw code (web-error-handling.md §5). A lookup rather than a chain of
// conditionals (`writing-web-components.md` §6).
//
// T17/ADR 0002 — `arrival_already_confirmed` left with the whole-draft act it
// belonged to. The two refusals a per-line ending raises in its place are the
// ones the approved design names: `fpRfr` (AC-20a, already recorded — when and
// by whom) and `fssB1` (AC-20, the wrong ending for this line — which of the two
// ways its goods travelled). Both are reachable only from a stale view, because
// `LineEndingAction` offers neither the second ending nor the wrong one; that is
// exactly why they still need a sentence.
// T19 — the three refusal codes this feature adds. `condition_split_invalid` and
// `pre_receipt_conformance_invalid` judge the Condition Split and the Conformance
// judgement against the locked line; `invalid_input` is the payload's own shape
// bounds (AC-02/AC-03/AC-06/AC-07/AC-09/AC-14/AC-15b/AC-16/AC-17/AC-17a/AC-25).
const REFUSAL_STATE_BY_CODE: Record<string, EndingRefusalState> = {
  [ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS]: 'bounds',
  [ErrorCode.PURCHASE_DRAFTS_ENDING_ALREADY_RECORDED]: 'alreadyRecorded',
  [ErrorCode.PURCHASE_DRAFTS_ENDING_MODE_MISMATCH]: 'modeMismatch',
  [ErrorCode.PURCHASE_DRAFTS_INVALID_STATE]: 'invalidState',
  [ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID]: 'conditionSplit',
  [ErrorCode.PURCHASE_DRAFTS_PRE_RECEIPT_CONFORMANCE_INVALID]: 'conformance',
  [ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT]: 'invalidInput',
};

/** A violation's own `violations` array, read defensively — an envelope this
 * build cannot parse yields none rather than throwing. */
const violationsOf = (
  details: Record<string, unknown> | undefined,
): Violation[] => {
  const raw = details?.violations;
  return Array.isArray(raw)
    ? raw.filter(
        (entry): entry is Violation =>
          typeof entry === 'object' && entry !== null,
      )
    : [];
};

const numberOf = (value: unknown): number =>
  typeof value === 'number' ? value : 0;
const stringOf = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const listOf = (value: unknown): string =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .join(', ')
    : '';
const ruleOf = (violation: Violation): string | undefined =>
  typeof violation.rule === 'string' ? violation.rule : undefined;

/** One bullet per violation this build recognizes for the given rule table — a
 * rule this build does not know is dropped rather than failing the whole list
 * (the same defence `bulletOf` below applies to the bounds violations). */
const violationBullets = (
  details: Record<string, unknown> | undefined,
  textByRule: Record<string, (violation: Violation) => string>,
): BoundBullet[] =>
  violationsOf(details).flatMap((violation, index) => {
    const rule = ruleOf(violation);
    const build = rule === undefined ? undefined : textByRule[rule];
    return build === undefined
      ? []
      : [{ key: `${rule}-${index}`, text: build(violation) }];
  });

/** A namespace-scoped translator, narrowed to what the T19 rule tables need. */
type Translate = (key: string, options?: Record<string, unknown>) => string;
/** The group-separated quantity formatter every other figure on this alert renders through. */
type FormatQuantity = (value: number) => string;

// T19 — the Condition Split judged against the locked line and the catalogue
// (AC-02, AC-06, AC-07, AC-09, AC-25). No violation ever carries a customer
// name or the line's own prose (contracts/openapi.yaml `InvalidLineEndingConditionInput`),
// so every sentence below reads only the identifiers and figures the server sends.
const conditionSplitTextByRule = (
  t: Translate,
  quantity: FormatQuantity,
): Record<string, (violation: Violation) => string> => ({
  rejections_exceed_received: (violation) =>
    t(
      'transitions.lineEnding.refusal.conditionSplit.rejectionsExceedReceived',
      {
        received: quantity(numberOf(violation.receivedQuantity)),
        rejected: quantity(numberOf(violation.rejectedQuantity)),
      },
    ),
  unknown_rejection_reason: (violation) =>
    t('transitions.lineEnding.refusal.conditionSplit.unknownReason', {
      available: listOf(violation.availableRejectionReasonIds),
      reason: stringOf(violation.rejectionReasonId),
    }),
  description_required: (violation) =>
    t('transitions.lineEnding.refusal.conditionSplit.descriptionRequired', {
      reason: stringOf(violation.rejectionReasonId),
    }),
  duplicate_rejection_reason: (violation) =>
    t('transitions.lineEnding.refusal.conditionSplit.duplicateReason', {
      reason: stringOf(violation.rejectionReasonId),
    }),
  source_mismatch: (violation) =>
    t('transitions.lineEnding.refusal.conditionSplit.sourceMismatch', {
      reason: stringOf(violation.rejectionReasonId),
    }),
});

// T19 — the Conformance judgement judged against the same locked line (AC-16,
// AC-17, AC-17a).
const conformanceTextByRule = (
  t: Translate,
): Record<string, (violation: Violation) => string> => ({
  met_contradicts_rejection: (violation) =>
    t('transitions.lineEnding.refusal.conformance.metContradictsRejection', {
      reason: stringOf(violation.rejectionReasonId),
    }),
  not_applicable_on_instructed_line: () =>
    t(
      'transitions.lineEnding.refusal.conformance.notApplicableOnInstructedLine',
    ),
  verdict_on_uninstructed_line: () =>
    t('transitions.lineEnding.refusal.conformance.verdictOnUninstructedLine'),
});

// T19 — the payload's own shape bounds (AC-03, AC-14, AC-15b, AC-04a).
const invalidInputTextByRule = (
  t: Translate,
  quantity: FormatQuantity,
): Record<string, (violation: Violation) => string> => ({
  quantity_out_of_range: () =>
    t('transitions.lineEnding.refusal.invalidInput.quantityOutOfRange'),
  description_too_long: (violation) =>
    t('transitions.lineEnding.refusal.invalidInput.descriptionTooLong', {
      maxLength: quantity(numberOf(violation.maxLength)),
    }),
  description_empty: () =>
    t('transitions.lineEnding.refusal.invalidInput.descriptionEmpty'),
  description_not_trimmed: () =>
    t('transitions.lineEnding.refusal.invalidInput.descriptionNotTrimmed'),
  note_too_long: (violation) =>
    t('transitions.lineEnding.refusal.invalidInput.noteTooLong', {
      maxLength: quantity(numberOf(violation.maxLength)),
    }),
  note_empty: () => t('transitions.lineEnding.refusal.invalidInput.noteEmpty'),
  note_not_trimmed: () =>
    t('transitions.lineEnding.refusal.invalidInput.noteNotTrimmed'),
  note_not_admitted_by_verdict: () =>
    t('transitions.lineEnding.refusal.invalidInput.noteNotAdmittedByVerdict'),
  condition_on_nothing_received: () =>
    t('transitions.lineEnding.refusal.invalidInput.conditionOnNothingReceived'),
});

/**
 * The shared shape of a T19 blocked submission (`b799Xv`, `KOuxb`, `MBCzx`,
 * `Hy3k1`, `QS499`, `XJ5GY`, `aNXAl`): a title naming the code, the shared
 * "nothing saved" line, one bullet per violation this build recognizes — or
 * the generic fallback when none survived — and the same `Back to the form`
 * control the bounds refusal already offers.
 */
const renderViolationAlert = (
  t: Translate,
  onDismiss: () => void,
  titleKey: string,
  ruleBullets: BoundBullet[],
): ReactElement => (
  <>
    <Alert.Title>{t(titleKey)}</Alert.Title>
    <Alert.Description>
      <p>{t('transitions.lineEnding.nothingSaved')}</p>
      <Conditional
        when={ruleBullets.length > 0}
        otherwise={
          <p className="mt-2">{t('transitions.lineEnding.refusal.unknown')}</p>
        }
      >
        <ul className="mt-2 list-disc pl-5">
          {ruleBullets.map(({ key, text }) => (
            <li key={key}>{text}</li>
          ))}
        </ul>
      </Conditional>
      <Button className="mt-3" size="sm" variant="ghost" onPress={onDismiss}>
        {t('transitions.lineEnding.refusal.bounds.back')}
      </Button>
    </Alert.Description>
  </>
);

// Which sentence a bound that is not the Customer Order's arithmetic reads.
// A lifecycle state this build does not know still gets a sentence rather than
// no bullet at all, because the member is owed the name of every refused
// assignment.
const NOT_UNFULFILLED_KEY: Record<string, string> = {
  cancelled: 'cancelled',
  fulfilled: 'fulfilled',
};

/**
 * What the Arrival Confirmation was refused for (AC-18), stated as the approved
 * frame `s5EPi` writes it: the heading, that nothing of the confirmation was
 * saved, **one bullet per broken bound naming it**, and the closing line saying
 * every bound is re-checked when the confirmation is recorded rather than when
 * the member started filling it in.
 *
 * The bullets are the server's own breakdown, not a guess: the domain publishes
 * one entry per failing bound in the refusal's `details.violations`, so the only
 * work here is resolving each identifier to the line number or customer name the
 * member typed against. A refusal that carries no breakdown falls back to the
 * one sentence the three bounds share, rather than inventing bounds the response
 * does not contain.
 *
 * `Back to the form` dismisses the refusal and leaves every figure the member
 * entered exactly where it was — a refused confirmation changed nothing, so
 * there is nothing to re-enter.
 */
export const EndingRefusalAlert = ({
  code,
  details,
  draft,
  onDismiss,
}: EndingRefusalAlertProps): ReactElement | null => {
  const { t } = useTranslation('purchase-draft');
  const linkNaming = useLinkNaming();
  const { quantity, shortTimestampDate } = useLocaleFormat();

  if (code === undefined) {
    return null;
  }

  const lineNumbers = new Map(
    draft.lines.map((line, index) => [line.id, index + 1]),
  );
  const customerNames = new Map(
    draft.lines.flatMap((line) =>
      line.links.map((link) => [link.id, linkNaming(link)] as const),
    ),
  );

  // One bullet per bound, dropped only when the identifier names nothing on the
  // draft in front of the member — a bullet that cannot say *which* line or
  // customer was refused says nothing the frame asks it to say.
  const bulletOf = (violation: EndingBoundViolation): BoundBullet[] => {
    if (violation.rule === 'allocations_exceed_received_quantity') {
      const line = lineNumbers.get(violation.purchaseDraftLineId);

      return line === undefined
        ? []
        : [
            {
              key: `${violation.rule}-${violation.purchaseDraftLineId}`,
              text: t('transitions.lineEnding.refusal.bounds.exceedsReceived', {
                assigned: quantity(violation.allocatedQuantity),
                line,
                received: quantity(violation.receivedQuantity),
              }),
            },
          ];
    }

    // AC-11 — the bound narrowed from what arrived to what was accepted, so the
    // bullet names the assignment field that overshoots (the line) and states
    // the shortfall in words, alongside the shipped `exceedsReceived` bullet.
    if (violation.rule === 'allocations_exceed_accepted_quantity') {
      const line = lineNumbers.get(violation.purchaseDraftLineId);

      return line === undefined
        ? []
        : [
            {
              key: `${violation.rule}-${violation.purchaseDraftLineId}`,
              text: t('transitions.lineEnding.refusal.bounds.exceedsAccepted', {
                accepted: quantity(violation.acceptedQuantity),
                allocated: quantity(violation.allocatedQuantity),
                line,
                received: quantity(violation.receivedQuantity),
                rejected: quantity(violation.rejectedQuantity),
              }),
            },
          ];
    }

    const key = `${violation.rule}-${violation.purchaseDraftLineLinkId}`;
    const customer = customerNames.get(violation.purchaseDraftLineLinkId);
    if (customer === undefined) {
      return [];
    }

    if (violation.rule === 'exceeds_outstanding_quantity') {
      return [
        {
          key,
          text: t('transitions.lineEnding.refusal.bounds.exceedsOutstanding', {
            assigned: quantity(violation.allocatedQuantity),
            customer,
            outstanding: quantity(violation.outstandingQuantity),
          }),
        },
      ];
    }

    const suffix =
      NOT_UNFULFILLED_KEY[violation.customerOrderState] ?? 'unavailable';
    const { customerOrderLastChangedAt: movedAt } = violation;

    return [
      {
        key,
        text: t(`transitions.lineEnding.refusal.bounds.${suffix}`, {
          // AC-18 — the frame dates the refused order's move ("Baltic Freight
          // OÜ — cancelled on 24 Aug, so nothing can be assigned to it"), and
          // i18next's context suffix selects that wording. A link the server
          // locked no order for carries no moment and reads undated, which is
          // the only sentence honest about what the refusal actually knows.
          context: movedAt === null ? undefined : 'dated',
          customer,
          on: movedAt === null ? '' : shortTimestampDate(movedAt),
        }),
      },
    ];
  };

  const bullets = endingBoundViolations(details).flatMap(bulletOf);

  // T19 — the three refusal codes this feature adds, each dispatched through
  // its own rule table (`conditionSplitTextByRule`, `conformanceTextByRule`,
  // `invalidInputTextByRule` above) and rendered through the shared
  // `renderViolationAlert` shape.
  const conditionSplitBullets = violationBullets(
    details,
    conditionSplitTextByRule(t, quantity),
  );
  const conformanceBullets = violationBullets(
    details,
    conformanceTextByRule(t),
  );
  const invalidInputBullets = violationBullets(
    details,
    invalidInputTextByRule(t, quantity),
  );

  // The two per-line refusals carry their own small envelopes. Read defensively:
  // a refusal whose envelope this build cannot parse still gets its undated or
  // unqualified sentence rather than no sentence at all.
  const recordedAt =
    typeof details?.endingRecordedAt === 'string'
      ? details.endingRecordedAt
      : null;
  const deliveryMode =
    details?.deliveryMode === 'via_warehouse' ||
    details?.deliveryMode === 'direct_to_customer'
      ? details.deliveryMode
      : null;

  /** The sentence a refusal with no per-bound breakdown states on its own. */
  const generic = (key: EndingRefusalState): ReactElement => (
    <Alert.Description>
      {`${t(`transitions.lineEnding.refusal.${key}`)} ${t('transitions.lineEnding.nothingSaved')}`}
    </Alert.Description>
  );

  const content: Record<EndingRefusalState, ReactElement> = {
    // AC-20a — "naming when and by whom", so the sentence is interpolated from
    // the refusal's own envelope rather than being the generic one.
    alreadyRecorded: (
      <Alert.Description>
        {`${t('transitions.lineEnding.refusal.alreadyRecorded', {
          on: recordedAt === null ? '' : shortTimestampDate(recordedAt),
          context: recordedAt === null ? undefined : 'dated',
        })} ${t('transitions.lineEnding.nothingSaved')}`}
      </Alert.Description>
    ),
    // AC-20 — "naming which of the two ways that line's goods travelled".
    modeMismatch: (
      <Alert.Description>
        {`${t(
          `transitions.lineEnding.refusal.modeMismatch.${
            deliveryMode ?? 'unknown'
          }`,
        )} ${t('transitions.lineEnding.nothingSaved')}`}
      </Alert.Description>
    ),
    invalidState: generic('invalidState'),
    unknown: generic('unknown'),
    conditionSplit: renderViolationAlert(
      t,
      onDismiss,
      'transitions.lineEnding.refusal.conditionSplit.title',
      conditionSplitBullets,
    ),
    conformance: renderViolationAlert(
      t,
      onDismiss,
      'transitions.lineEnding.refusal.conformance.title',
      conformanceBullets,
    ),
    invalidInput: renderViolationAlert(
      t,
      onDismiss,
      'transitions.lineEnding.refusal.invalidInput.title',
      invalidInputBullets,
    ),
    bounds: (
      <>
        <Alert.Title>
          {t('transitions.lineEnding.refusal.bounds.title')}
        </Alert.Title>
        <Alert.Description>
          <p>{t('transitions.lineEnding.nothingSaved')}</p>
          <Conditional
            when={bullets.length > 0}
            otherwise={
              <p className="mt-2">
                {t('transitions.lineEnding.refusal.allocationOutOfBounds')}
              </p>
            }
          >
            <ul className="mt-2 list-disc pl-5">
              {bullets.map(({ key, text }) => (
                <li key={key}>{text}</li>
              ))}
            </ul>
          </Conditional>
          <p className="mt-2">
            {t('transitions.lineEnding.refusal.bounds.checkedAgain')}
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="ghost"
            onPress={onDismiss}
          >
            {t('transitions.lineEnding.refusal.bounds.back')}
          </Button>
        </Alert.Description>
      </>
    ),
  };

  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        {content[REFUSAL_STATE_BY_CODE[code] ?? 'unknown']}
      </Alert.Content>
    </Alert>
  );
};
