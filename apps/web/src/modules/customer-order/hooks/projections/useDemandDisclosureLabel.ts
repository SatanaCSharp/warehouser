import { useTranslation } from 'react-i18next';

import type { DemandLine } from '@warehouser/contracts/customer-orders';

/** Names the disclosure of one Demand Line, in whichever state it is in. */
export type DemandDisclosureLabel = (
  line: DemandLine,
  isExpanded: boolean,
) => string;

/**
 * What a Demand Line's disclosure control is called: how many Unfulfilled
 * Customer Orders it hides or reveals, and for which Item (AC-04, AC-20).
 *
 * The table and the mobile card list both offer that control, so the copy is
 * resolved here once rather than assembled from the same three arguments in
 * two files.
 */
export const useDemandDisclosureLabel = (): DemandDisclosureLabel => {
  const { t } = useTranslation('customer-order');

  return (line, isExpanded) =>
    t(isExpanded ? 'demand.disclosure.hide' : 'demand.disclosure.show', {
      count: line.unfulfilledCustomerOrderCount,
      item: `${line.sku}, ${line.description}`,
    });
};
