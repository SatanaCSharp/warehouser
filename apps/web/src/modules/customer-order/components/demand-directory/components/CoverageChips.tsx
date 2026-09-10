import { Chip } from '@heroui/react';
import type { DemandLine } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

export type CoverageChipsProps = {
  coverage: DemandLine['coverage'];
};

/**
 * How much of a Demand Line an open Purchase Draft already covers — one chip
 * per covering draft line, and a plain statement when none does (AC-20,
 * AC-21a). Remaining demand under a Closed draft arrives as no coverage at all,
 * because `readConsolidatedDemand` omits it server-side; this renders that
 * honestly rather than inferring a draft that no longer covers anything.
 *
 * Each chip **names the draft**: `PD-0142 · 800` (design frame `G6jhw`).
 * AC-20 requires the member be shown which drafts link to the demand, and a
 * quantity alone answers "how much" without answering "whose" — a member cannot
 * act on `800 on draft` because they cannot find the draft it refers to. The
 * reference is `purchaseDraftReference` on `demandCoverageSchema`, and the
 * quantity is group-separated like every other figure in the frames.
 *
 * The desktop cell and the mobile card both render it, so the two cannot
 * disagree about what covers a line.
 */
export const CoverageChips = ({
  coverage,
}: CoverageChipsProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const format = useLocaleFormat();

  if (coverage.length === 0) {
    return (
      <span className="text-sm text-muted">{t('demand.coverage.none')}</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {coverage.map((entry) => (
        <Chip
          key={entry.purchaseDraftLineId}
          color="accent"
          size="sm"
          variant="soft"
        >
          {t('demand.coverage.chip', {
            reference: entry.purchaseDraftReference,
            quantity: format.quantity(entry.statedQuantity),
          })}
        </Chip>
      ))}
    </div>
  );
};
