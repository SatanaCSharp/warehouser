import { Button, Card, Disclosure } from '@heroui/react';

import { CoverageChips } from 'modules/customer-order/components/demand-directory/components/CoverageChips';
import { CustomerOrderActionsMenu } from 'modules/customer-order/components/demand-directory/components/CustomerOrderActionsMenu';

import type {
  CustomerOrder,
  DemandLine,
} from '@warehouser/contracts/customer-orders';
import type { CustomerOrderActionHandlers } from 'modules/customer-order/hooks/projections/useCustomerOrderActions';
import type { DemandDisclosureLabel } from 'modules/customer-order/hooks/projections/useDemandDisclosureLabel';
import type { ReactElement } from 'react';

export type DemandCardProps = CustomerOrderActionHandlers & {
  customerOrders: CustomerOrder[];
  disclosureLabel: DemandDisclosureLabel;
  line: DemandLine;
};

/**
 * One Item's consolidated Unfulfilled demand, carried as a card below the
 * split-view breakpoint (design-handoff.md `Ordering/Demand Card Mobile`,
 * `XYIfs`). The same five facts as the desktop row, re-flowed, with the same
 * disclosure and the same per-order menu — `CoverageChips` and
 * `CustomerOrderActionsMenu` are the shared leaves that keep the two surfaces
 * from drifting apart.
 *
 * Expansion is HeroUI's `Disclosure`, uncontrolled: the panel's visibility, the
 * trigger's `aria-expanded` and the `aria-controls` pairing all come from it,
 * so this file keeps no `isExpanded` state and hand-rolls no toggle. The
 * render function is what the label reads that state through, which is why this
 * component still holds none itself.
 *
 * `Disclosure.Heading` is deliberately omitted: `Card.Title` is already this
 * card's heading, and a second one for the trigger would announce the same Item
 * twice.
 */
export const DemandCard = ({
  customerOrders,
  disclosureLabel,
  line,
  onAmend,
  onCancel,
}: DemandCardProps): ReactElement => (
  <li>
    <Card>
      <Disclosure>
        {({ isExpanded }) => (
          <>
            <Card.Header className="flex flex-row items-start justify-between gap-2">
              <div>
                <Card.Title>{line.sku}</Card.Title>
                <Card.Description>{line.description}</Card.Description>
              </div>
              <Button
                isIconOnly
                size="sm"
                slot="trigger"
                variant="ghost"
                aria-label={disclosureLabel(line, isExpanded)}
              >
                <Disclosure.Indicator />
              </Button>
            </Card.Header>

            <Card.Content className="text-sm">
              <p>{line.totalOutstandingQuantity}</p>
              <p>{line.earliestNeededBy}</p>
              <p>{line.onHandQuantity}</p>
              <div className="mt-1">
                <CoverageChips coverage={line.coverage} />
              </div>

              <Disclosure.Content>
                <Disclosure.Body className="mt-3">
                  <ul className="grid gap-2">
                    {customerOrders.map((order) => (
                      <li
                        className="flex items-start justify-between gap-2 rounded-lg bg-surface-secondary p-3 pl-6"
                        key={order.id}
                      >
                        <div>
                          <p className="font-semibold">{order.customerName}</p>
                          <p className="text-sm text-muted">
                            {order.outstandingQuantity} · {order.neededBy}
                          </p>
                        </div>
                        <CustomerOrderActionsMenu
                          order={order}
                          onAmend={onAmend}
                          onCancel={onCancel}
                        />
                      </li>
                    ))}
                  </ul>
                </Disclosure.Body>
              </Disclosure.Content>
            </Card.Content>
          </>
        )}
      </Disclosure>
    </Card>
  </li>
);
