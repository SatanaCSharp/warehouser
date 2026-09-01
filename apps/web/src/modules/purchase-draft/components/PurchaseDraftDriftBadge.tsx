import { useTranslation } from 'react-i18next';

import { useDriftingPurchaseDraftCount } from 'modules/purchase-draft/hooks/projections/useDriftingPurchaseDraftCount';
import { Conditional } from 'shared/components/Conditional';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { ReactNode } from 'react';

/**
 * The count beside `Purchase drafts` in the shell's navigation (frame `yGhkK`):
 * how many frozen drafts are reporting that the demand behind them moved, so
 * US-08 is served from outside the drafts destination too.
 *
 * It gates itself and takes no props — a Warehouse whose drafts all still match
 * their demand gets no badge at all rather than a zero, so the sidebar accepts
 * no visibility flag (`writing-web-components.md` §6). The entry it sits in is
 * already behind `PURCHASE_DRAFTS:WATCH`, so this reads nothing an actor may
 * not read.
 *
 * The numeral alone would communicate by position; the `role="status"` label
 * says what it counts, which is what an assistive technology announces
 * (design-handoff.md §Accessibility).
 */
export const PurchaseDraftDriftBadge = (): ReactNode => {
  const { t } = useTranslation('purchase-draft');
  const { quantity } = useLocaleFormat();
  const count = useDriftingPurchaseDraftCount();

  return (
    <Conditional when={count > 0}>
      <span
        aria-label={t('workspace.driftBadge', { count })}
        className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning"
        role="status"
      >
        {quantity(count)}
      </span>
    </Conditional>
  );
};
