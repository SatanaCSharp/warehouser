import { Button, Card, Disclosure } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { CoverageChips } from 'modules/customer-order/components/demand-directory/components/CoverageChips';
import { CustomerOrderActionsMenu } from 'modules/customer-order/components/demand-directory/components/CustomerOrderActionsMenu';
import { DemandUrgencyChip } from 'modules/customer-order/components/demand-directory/components/DemandUrgencyChip';
import { customerOrderDisplayName } from 'modules/customer-order/utils/customer-order-identity';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type {
  CustomerOrder,
  CustomerOrderState,
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
 * The state a sub-card names in its own summary line. A total lookup, so a
 * fourth lifecycle state cannot silently render an untranslated key
 * (`writing-web-components.md` §6).
 */
const stateLabels: Record<CustomerOrderState, string> = {
  unfulfilled: 'chips.unfulfilled',
  fulfilled: 'chips.fulfilled',
  cancelled: 'chips.cancelled',
};

/**
 * One Item's consolidated Unfulfilled demand, carried as a card below the
 * split-view breakpoint (design-handoff.md `Ordering/Demand Card Mobile`,
 * `XYIfs`, mobile frame `SjdPo`). The same five facts as the desktop row,
 * re-flowed, with the same disclosure and the same per-order menu —
 * `CoverageChips`, `DemandUrgencyChip` and `CustomerOrderActionsMenu` are the
 * shared leaves that keep the two surfaces from drifting apart.
 *
 * **Every value carries its label.** The desktop row gets its meaning from the
 * column header above it; a card has no header, so a bare `1 240`, `2 Sep 2026`
 * and `60` stacked together say nothing about which is outstanding, which is a
 * date and which is on hand. The frame labels all four, and so does this.
 *
 * A card is not inside a React Aria collection, so it may read its own
 * translations and formatters directly — the row-renderer restriction in
 * `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` applies to
 * `DemandTable`, not here.
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
}: DemandCardProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const format = useLocaleFormat();

  return (
    <li>
      <Card>
        <Disclosure>
          {({ isExpanded }) => (
            <>
              <Card.Header>
                <Card.Title>{line.description}</Card.Title>
                <Card.Description>
                  {t('demand.item.meta', {
                    sku: line.sku,
                    unit: line.unitOfMeasure,
                  })}
                </Card.Description>
              </Card.Header>

              <Card.Content className="text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted">
                      {t('demand.table.outstanding')}
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {format.quantity(line.totalOutstandingQuantity)}
                    </p>
                    <p className="text-xs text-muted">{line.unitOfMeasure}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted">
                      {t('demand.table.onHand')}
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {format.quantity(line.onHandQuantity)}
                    </p>
                    <p className="text-xs text-muted">
                      {t('demand.card.onHandCaption', {
                        unit: line.unitOfMeasure,
                      })}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-muted">
                    {t('demand.table.neededBy')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground">
                      {format.calendarDate(line.earliestNeededBy)}
                    </span>
                    <DemandUrgencyChip neededBy={line.earliestNeededBy} />
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-muted">
                    {t('demand.table.coveredBy')}
                  </p>
                  <CoverageChips coverage={line.coverage} />
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  {/* The trigger names itself with its own visible text, so no
                      `aria-label` overrides what a sighted member reads. */}
                  <Button size="sm" slot="trigger" variant="ghost">
                    <Disclosure.Indicator />
                    {disclosureLabel(line, isExpanded)}
                  </Button>
                </div>

                <Disclosure.Content>
                  <Disclosure.Body className="mt-3">
                    <ul className="grid gap-2">
                      {customerOrders.map((order) => (
                        <li
                          className="flex items-start justify-between gap-2 rounded-lg bg-surface-secondary p-3"
                          key={order.id}
                        >
                          <div>
                            <p className="font-semibold">
                              {customerOrderDisplayName(order)}
                            </p>
                            <p className="text-sm text-muted">
                              {t('demand.card.customerOrder', {
                                outstanding: format.quantity(
                                  order.outstandingQuantity,
                                ),
                                quantity: format.quantity(order.quantity),
                                date: format.calendarDate(order.neededBy),
                                state: t(stateLabels[order.state]),
                              })}
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
};
