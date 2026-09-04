import { useTranslation } from 'react-i18next';

import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { PurchaseDraftLineListEntry } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type DockLineDraftCellProps = {
  entry: PurchaseDraftLineListEntry;
};

/**
 * The `Draft` cell of `Delivery/Dock Line Row` (`DFncO`): the draft this line
 * belongs to, named by the human reference a member quotes, and when its goods
 * are expected.
 *
 * A line of a mixed draft appears in whichever half its own mode places it, so
 * the same reference shows up under both headings — which is exactly why every
 * row has to name it.
 *
 * It is its own component rather than an expression in a cell because it reads
 * a translation and a formatter, and a React Aria row renderer may call no
 * hook (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DockLineDraftCell = ({
  entry,
}: DockLineDraftCellProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { shortCalendarDate } = useLocaleFormat();

  const expected =
    entry.expectedArrivalDate === null
      ? t('byLine.noExpectedArrival')
      : t('byLine.expectedArrival', {
          date: shortCalendarDate(entry.expectedArrivalDate),
        });

  return (
    <span className="block min-w-0">
      <span className="block font-semibold text-foreground">
        {entry.purchaseDraftReference}
      </span>
      <span className="block text-sm text-muted">{expected}</span>
    </span>
  );
};
