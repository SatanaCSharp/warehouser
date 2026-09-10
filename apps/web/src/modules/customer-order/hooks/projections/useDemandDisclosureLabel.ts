import type { DemandLine } from '@warehouser/contracts/customer-orders';
import { useTranslation } from 'react-i18next';

/** Names the disclosure of one Demand Line, in whichever state it is in. */
export type DemandDisclosureLabel = (
  line: DemandLine,
  isExpanded: boolean,
) => string;

/**
 * What a Demand Line's disclosure control is called: how many Unfulfilled
 * Customer Orders it hides or reveals (AC-04, AC-20).
 *
 * The table and the mobile card list both offer that control, so the copy is
 * resolved here once rather than assembled from the same two arguments in two
 * files.
 *
 * It names no Item. The frames draw the control as `5 customer orders` and
 * `hide the 2 customer orders` (`G6jhw`, `SjdPo`) — visible text on both
 * surfaces, never an `aria-label` — and each surface already establishes which
 * Item that is: the table's control sits inside the row header cell React Aria
 * announces with the row, and the card's sits under the `Card.Title` that names
 * it. Repeating the Item here would make the button's visible text disagree
 * with the design and read the SKU twice per row.
 */
export const useDemandDisclosureLabel = (): DemandDisclosureLabel => {
  const { t } = useTranslation('customer-order');

  return (line, isExpanded) =>
    t(isExpanded ? 'demand.disclosure.hide' : 'demand.disclosure.show', {
      count: line.unfulfilledCustomerOrderCount,
    });
};
