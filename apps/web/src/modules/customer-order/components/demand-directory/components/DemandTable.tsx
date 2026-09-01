import { Table } from '@heroui/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CoverageChips } from 'modules/customer-order/components/demand-directory/components/CoverageChips';
import { CustomerOrderActionsMenu } from 'modules/customer-order/components/demand-directory/components/CustomerOrderActionsMenu';
import { CustomerOrderNeededByCell } from 'modules/customer-order/components/demand-directory/components/CustomerOrderNeededByCell';
import { CustomerOrderOutstandingCell } from 'modules/customer-order/components/demand-directory/components/CustomerOrderOutstandingCell';
import { CustomerOrderStateChip } from 'modules/customer-order/components/demand-directory/components/CustomerOrderStateChip';
import { DemandFooterSummary } from 'modules/customer-order/components/demand-directory/components/DemandFooterSummary';
import { DemandItemCell } from 'modules/customer-order/components/demand-directory/components/DemandItemCell';
import { DemandNeededByCell } from 'modules/customer-order/components/demand-directory/components/DemandNeededByCell';
import { DemandOnHandCell } from 'modules/customer-order/components/demand-directory/components/DemandOnHandCell';
import { DemandOutstandingCell } from 'modules/customer-order/components/demand-directory/components/DemandOutstandingCell';
import { useUnfulfilledCustomerOrdersByItem } from 'modules/customer-order/hooks/queries/useUnfulfilledCustomerOrdersByItem';
import { CornerDownRightIcon } from 'shared/icons';

import type { Selection } from '@heroui/react';
import type {
  CustomerOrder,
  DemandLine,
} from '@warehouser/contracts/customer-orders';
import type { CustomerOrderActionHandlers } from 'modules/customer-order/hooks/projections/useCustomerOrderActions';
import type { ReactElement } from 'react';

/** A Demand Line paired with the Customer Orders it expands into. */
type DemandRow = DemandLine & { customerOrders: CustomerOrder[] };

export type DemandTableProps = CustomerOrderActionHandlers & {
  demandLines: DemandLine[];
  /** Names the table for assistive technology; the destination's heading. */
  label: string;
};

/**
 * The Demand destination's table from the split-view breakpoint up
 * (design-handoff.md `Ordering/Demand Row`, `prm7R`, desktop `G6jhw`): one row
 * per Item with its six cells — item, outstanding, earliest needed by, on hand,
 * covered by, actions — expanding into that Item's Unfulfilled Customer Orders
 * (AC-04, AC-20), and the footer row stating what the table counts and what it
 * leaves out.
 *
 * It is a HeroUI `Table`, not a hand-assembled `<table>`
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`), so the
 * expansion is React Aria's: `treeColumn` puts the chevron in the item cell,
 * `expandedKeys` is the disclosure state, and the sub-rows are a nested
 * `Table.Collection` rather than sibling `<tr>`s a reader has to infer the
 * nesting of. Which rows are expanded is transient state nothing outside this
 * table reads, so it is owned here (`writing-web-components.md` §8).
 *
 * The two row renderers are plain functions, not components: a React Aria
 * collection builds its rows before they reach the DOM, so a renderer may call
 * no hook. Nor may it close over live state — the collection caches a row's
 * element tree per record, so anything resolved here would keep the value it
 * had when the row was first built. **That is why every cell below renders a
 * component rather than an expression**: each one reads its own translations,
 * its own date and quantity formatters, and its own Permissions.
 *
 * `onAmend` and `onCancel` are the exception the same decision names —
 * callbacks that only report an event upward. Each one hands the chosen
 * Customer Order to `DemandDirectory`'s dialog reducer and reads nothing else,
 * so the copy a row caches behaves identically to a fresh one. A handler that
 * additionally closed over something live — the entered Warehouse, a query
 * result — would not qualify, and is written in the component the cell renders
 * instead.
 *
 * Those orders are carried **on the record** rather than read from a map the
 * row renderer closes over, and that is the whole reason the chevron appears.
 * The Demand Lines arrive from the route loader while the Customer Orders are
 * still in flight, so a renderer closing over the map built its rows against an
 * empty one — no children, therefore no chevron — and the collection, keyed on
 * records that never changed, had no reason to rebuild when the orders landed.
 * Pairing each line with its orders makes the record change when they arrive,
 * which is what rebuilds the row and reveals its expansion.
 */
export const DemandTable = ({
  demandLines,
  label,
  onAmend,
  onCancel,
}: DemandTableProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const [expandedKeys, setExpandedKeys] = useState<Selection>(() => new Set());
  const customerOrdersByItem = useUnfulfilledCustomerOrdersByItem();

  const demandRows: DemandRow[] = useMemo(
    () =>
      demandLines.map((line) => ({
        ...line,
        customerOrders: customerOrdersByItem[line.itemId] ?? [],
      })),
    [customerOrdersByItem, demandLines],
  );

  const onExpandedChange = (keys: Selection): void => setExpandedKeys(keys);

  const renderCustomerOrderRow = (order: CustomerOrder): ReactElement => (
    <Table.Row id={order.id} key={order.id} textValue={order.customerName}>
      <Table.Cell className="pl-12" textValue={order.customerName}>
        <span className="inline-flex items-center gap-2">
          <CornerDownRightIcon />
          {order.customerName}
        </span>
      </Table.Cell>
      <Table.Cell>
        <CustomerOrderOutstandingCell order={order} />
      </Table.Cell>
      <Table.Cell>
        <CustomerOrderNeededByCell order={order} />
      </Table.Cell>
      <Table.Cell />
      <Table.Cell>
        <CustomerOrderStateChip order={order} />
      </Table.Cell>
      <Table.Cell>
        <CustomerOrderActionsMenu
          order={order}
          onAmend={onAmend}
          onCancel={onCancel}
        />
      </Table.Cell>
    </Table.Row>
  );

  const renderDemandRow = (line: DemandRow): ReactElement => (
    <Table.Row id={line.itemId} key={line.itemId} textValue={line.sku}>
      <Table.Cell textValue={line.sku}>
        {({ hasChildItems, isExpanded, isTreeColumn }) => (
          <DemandItemCell
            hasChildItems={hasChildItems}
            isExpanded={isExpanded}
            isTreeColumn={isTreeColumn}
            line={line}
          />
        )}
      </Table.Cell>
      <Table.Cell>
        <DemandOutstandingCell line={line} />
      </Table.Cell>
      <Table.Cell>
        <DemandNeededByCell line={line} />
      </Table.Cell>
      <Table.Cell>
        <DemandOnHandCell line={line} />
      </Table.Cell>
      <Table.Cell>
        <CoverageChips coverage={line.coverage} />
      </Table.Cell>
      {/* Recording further demand is offered once, at the destination, by
          `RecordDemandAction`, so this Item-level cell stays reserved rather
          than duplicating that trigger per row; the sub-rows below carry the
          per-order menu. */}
      <Table.Cell />
      <Table.Collection items={line.customerOrders}>
        {renderCustomerOrderRow}
      </Table.Collection>
    </Table.Row>
  );

  return (
    <Table className="mt-4 hidden lg:block" variant="secondary">
      <Table.ScrollContainer>
        <Table.Content
          aria-label={label}
          expandedKeys={expandedKeys}
          treeColumn="item"
          onExpandedChange={onExpandedChange}
        >
          <Table.Header>
            <Table.Column isRowHeader id="item">
              {t('demand.table.item')}
            </Table.Column>
            <Table.Column id="outstanding">
              {t('demand.table.outstanding')}
            </Table.Column>
            <Table.Column id="neededBy">
              {t('demand.table.neededBy')}
            </Table.Column>
            <Table.Column id="onHand">{t('demand.table.onHand')}</Table.Column>
            <Table.Column id="coveredBy">
              {t('demand.table.coveredBy')}
            </Table.Column>
            <Table.Column id="actions">
              <span className="sr-only">{t('demand.table.actions')}</span>
            </Table.Column>
          </Table.Header>
          <Table.Body items={demandRows}>{renderDemandRow}</Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
      <Table.Footer>
        <DemandFooterSummary demandLines={demandLines} />
      </Table.Footer>
    </Table>
  );
};
