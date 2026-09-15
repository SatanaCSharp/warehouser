import type { DemandLine } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type DemandFooterSummaryProps = {
  /** The Demand Lines currently presented, after any search filter. */
  demandLines: DemandLine[];
};

/**
 * The table's footer row (design frame `G6jhw`): the two counts on the left —
 * `4 items · 12 unfulfilled customer orders` — and on the right the sentence
 * that says which Customer Orders those counts leave out.
 *
 * Both are on `design-handoff.md`'s must-preserve list, and the right-hand
 * sentence is what stops a member reading the count as "every order ever
 * placed": a Fulfilled or cancelled order left the consolidated demand and is
 * counted nowhere here (AC-04, AC-17a).
 *
 * The counts are composed from two separately pluralized fragments because
 * i18next pluralizes on one `count` per key, and these are two different
 * things being counted.
 */
export const DemandFooterSummary = ({
  demandLines,
}: DemandFooterSummaryProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const orderCount = demandLines.reduce(
    (total, line) => total + line.unfulfilledCustomerOrderCount,
    0,
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <span className="font-medium text-foreground">
        {t('demand.footer.summary', {
          items: t('demand.footer.itemCount', { count: demandLines.length }),
          orders: t('demand.footer.orderCount', { count: orderCount }),
        })}
      </span>
      <span className="text-muted">{t('demand.footer.note')}</span>
    </div>
  );
};
