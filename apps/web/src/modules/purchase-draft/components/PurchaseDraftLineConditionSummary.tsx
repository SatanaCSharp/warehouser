import { useTranslation } from 'react-i18next';

import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { ReactElement } from 'react';

export type PurchaseDraftLineConditionSummaryProps = {
  accepted: number;
  itemSku: string;
  /**
   * Which of the two acts this ending records — decides whether the second
   * figure reads "PRESENTED" or "DELIVERED"
   * (`PRESENTED_FIGURE_KEY_BY_KIND` in `ConditionBlock.tsx`).
   */
  kind: 'arrival' | 'directDelivery';
  ordered: number;
  presented: number;
  refused: number;
};

/** Which figure label the second cell reads — the same total lookup
 * `ConditionBlock` keys its own live figure by. */
const PRESENTED_FIGURE_KEY: Record<
  PurchaseDraftLineConditionSummaryProps['kind'],
  string
> = {
  arrival: 'presented',
  directDelivery: 'delivered',
};

/** One of the four cells: the value first in the DOM, then the label —
 * visually reversed with `flex-col-reverse` so the label still reads above
 * the figure, exactly as `ConditionBlock`'s own `SummaryFigure` draws it. */
const SummaryFigure = ({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: 'danger';
  value: string;
}): ReactElement => (
  <div className="flex flex-col-reverse gap-[3px]">
    <span
      className={`text-xl font-semibold tracking-tight ${
        tone === 'danger' ? 'text-danger' : 'text-foreground'
      }`}
    >
      {value}
    </span>
    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
      {label}
    </span>
  </div>
);

/**
 * `Inspection/Condition Summary` (`bllT3`/`M9G5z`, T17): the same four
 * figures `ConditionBlock`'s live region announces, reused here as
 * **static text** for a closed line's read.
 *
 * In the ending dialog it is a live region, replacing nothing — the closed
 * read never re-announces a figure nobody just changed, so this component
 * carries no `role="status"` and no `aria-live` (design-handoff.md §
 * Component mapping). One row of four on desktop, 2×2 on mobile, same order
 * and labels at both widths.
 */
export const PurchaseDraftLineConditionSummary = ({
  accepted,
  itemSku,
  kind,
  ordered,
  presented,
  refused,
}: PurchaseDraftLineConditionSummaryProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { quantity } = useLocaleFormat();

  return (
    <div
      aria-label={t('transitions.lineEnding.condition.summaryLabel', {
        sku: itemSku,
      })}
      className="grid w-full grid-cols-2 gap-3 rounded-2xl border border-border bg-surface-secondary px-4 py-3 md:grid-cols-4"
    >
      <SummaryFigure
        label={t('transitions.lineEnding.condition.summaryFigures.ordered')}
        value={quantity(ordered)}
      />
      <SummaryFigure
        label={t(
          `transitions.lineEnding.condition.summaryFigures.${PRESENTED_FIGURE_KEY[kind]}`,
        )}
        value={quantity(presented)}
      />
      <SummaryFigure
        label={t('transitions.lineEnding.condition.summaryFigures.refused')}
        tone="danger"
        value={quantity(refused)}
      />
      <SummaryFigure
        label={t('transitions.lineEnding.condition.summaryFigures.accepted')}
        value={quantity(accepted)}
      />
    </div>
  );
};
