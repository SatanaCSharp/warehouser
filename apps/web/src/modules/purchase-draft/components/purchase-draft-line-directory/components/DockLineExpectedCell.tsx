import type { PurchaseDraftLineListEntry } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

export type DockLineExpectedCellProps = {
  entry: PurchaseDraftLineListEntry;
};

/**
 * The `EXPECTED` cell of `Delivery/Dock Line Row` (`DFncO`, frame `zj46c`):
 * when this line's goods are expected, so a member preparing the dock can
 * plan around it without opening the draft itself.
 *
 * It is its own component rather than an expression in a cell because it
 * reads a translation and a formatter, and a React Aria row renderer may call
 * no hook (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DockLineExpectedCell = ({
  entry,
}: DockLineExpectedCellProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { shortCalendarDate } = useLocaleFormat();

  const expected =
    entry.expectedArrivalDate === null
      ? t('byLine.noExpectedArrival')
      : shortCalendarDate(entry.expectedArrivalDate);

  return <span className="block text-sm text-muted">{expected}</span>;
};
