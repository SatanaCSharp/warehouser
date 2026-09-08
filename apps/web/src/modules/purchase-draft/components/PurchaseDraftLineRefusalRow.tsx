import { Button, Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { KebabIcon } from 'shared/icons';

import type {
  RejectionDisposition,
  RejectionSource,
  PurchaseDraftLineRejection,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftLineRefusalRowProps = {
  rejection: PurchaseDraftLineRejection;
};

/** The Source chip's wording — the same phrasing `ConditionBlock`'s own
 * source chip uses in the ending dialog, read here rather than restated
 * (design-handoff.md § Component mapping). */
const SOURCE_KEY: Record<RejectionSource, string> = {
  inspected: 'transitions.lineEnding.condition.sourceInspected',
  customer_reported: 'transitions.lineEnding.condition.sourceCustomerReported',
};

/** The Disposition chip's wording, as a total lookup rather than an
 * `if`/`else if` chain (`writing-web-components.md` §6) — a fifth Disposition
 * fails to compile here until it is given one. */
const DISPOSITION_KEY: Record<RejectionDisposition, string> = {
  undecided: 'closedLine.refusalRow.disposition.undecided',
  refused_at_delivery: 'closedLine.refusalRow.disposition.refused_at_delivery',
  held_for_return: 'closedLine.refusalRow.disposition.held_for_return',
  scrapped_on_site: 'closedLine.refusalRow.disposition.scrapped_on_site',
};

/**
 * `Inspection/Refusal Read Row` (`n4Ue8`/`Jm3OQ`, T17): the read-only account
 * of one Rejection on a closed line, read by an actor holding
 * `REJECTIONS:WATCH` (AC-21) — quantity beside its Reason **label** (never
 * the catalogue id, AC-23a's read-side half), the member's own description
 * rendered as wrapped text, the Source and Disposition each as their own
 * chip, and a kebab naming its subject.
 *
 * **Read-only.** Nothing here is an editable control; the kebab is the row's
 * only affordance, and what it opens is T18's amend-refusal dialog.
 *
 * Mobile stacks the chips beneath the description rather than beside it —
 * the same width-only difference `writing-web-components.md` documents for
 * every other row in this module.
 */
export const PurchaseDraftLineRefusalRow = ({
  rejection,
}: PurchaseDraftLineRefusalRowProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  const kebabLabel = t('closedLine.refusalRow.actionsFor', {
    quantity: rejection.quantity,
    reason: rejection.rejectionReasonLabel,
  });

  return (
    <li className="flex w-full flex-wrap items-center gap-3.5 rounded-2xl bg-surface-secondary px-3.5 py-2.5">
      {/* `×{quantity}` rather than the bare figure: the condition summary
          right above this row already states the same total refused
          quantity as its own isolated text node when a line carries exactly
          one refusal, and the two must stay two distinguishable readings of
          the account rather than one number appearing to repeat itself. */}
      <span className="w-11 shrink-0 text-base font-semibold text-danger">
        ×{rejection.quantity}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-semibold text-foreground">
          {rejection.rejectionReasonLabel}
        </p>
        {/* Never truncated, never markup, never a link (spec §6.1 abuse
            cases, design-handoff.md §Accessibility): a member's description
            is prose and every surface that renders one must wrap it. */}
        <p className="break-words text-xs leading-relaxed text-muted">
          {rejection.description}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Chip size="sm" variant="soft">
          {t(SOURCE_KEY[rejection.source])}
        </Chip>
        <Chip size="sm" variant="soft">
          {t(DISPOSITION_KEY[rejection.disposition])}
        </Chip>
      </div>

      <Button isIconOnly aria-label={kebabLabel} size="sm" variant="ghost">
        <KebabIcon />
      </Button>
    </li>
  );
};
