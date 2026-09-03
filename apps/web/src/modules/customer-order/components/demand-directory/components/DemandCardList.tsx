import { DemandCard } from 'modules/customer-order/components/demand-directory/components/DemandCard';
import { useDemandDisclosureLabel } from 'modules/customer-order/hooks/projections/useDemandDisclosureLabel';
import { useUnfulfilledCustomerOrdersByItem } from 'modules/customer-order/hooks/queries/useUnfulfilledCustomerOrdersByItem';

import type { DemandLine } from '@warehouser/contracts/customer-orders';
import type { CustomerOrderActionHandlers } from 'modules/customer-order/hooks/projections/useCustomerOrderActions';
import type { ReactElement } from 'react';

export type DemandCardListProps = CustomerOrderActionHandlers & {
  demandLines: DemandLine[];
  /** Names the list for assistive technology; the destination's heading. */
  label: string;
};

/**
 * The Demand destination below the split-view breakpoint (design-handoff.md
 * `SjdPo`): one card per Item instead of a table row.
 *
 * It reads the same two projections and the same query `DemandTable` does
 * rather than being handed their results — RTK Query deduplicates the
 * subscription, so the second read costs no second request
 * (`writing-web-components.md` §4).
 */
export const DemandCardList = ({
  demandLines,
  label,
  onAmend,
  onCancel,
  onRedirect,
}: DemandCardListProps): ReactElement => {
  const customerOrdersByItem = useUnfulfilledCustomerOrdersByItem();
  const disclosureLabel = useDemandDisclosureLabel();

  return (
    <ul aria-label={label} className="mt-4 grid gap-3 lg:hidden">
      {demandLines.map((line) => (
        <DemandCard
          key={line.itemId}
          customerOrders={customerOrdersByItem[line.itemId] ?? []}
          disclosureLabel={disclosureLabel}
          line={line}
          onAmend={onAmend}
          onCancel={onCancel}
          onRedirect={onRedirect}
        />
      ))}
    </ul>
  );
};
