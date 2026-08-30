import { Table } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CoverageChips } from 'modules/customer-order/components/demand-directory/components/CoverageChips';
import { CustomerOrderActionsMenu } from 'modules/customer-order/components/demand-directory/components/CustomerOrderActionsMenu';
import { DemandDisclosureButton } from 'modules/customer-order/components/demand-directory/components/DemandDisclosureButton';
import { useUnfulfilledCustomerOrdersByItem } from 'modules/customer-order/hooks/queries/useUnfulfilledCustomerOrdersByItem';
import { Conditional } from 'shared/components/Conditional';
import { CornerDownRightIcon } from 'shared/icons';

import type { Selection } from '@heroui/react';
import type {
  CustomerOrder,
  DemandLine,
} from '@warehouser/contracts/customer-orders';
import type { CustomerOrderActionHandlers } from 'modules/customer-order/hooks/projections/useCustomerOrderActions';
import type { ReactElement } from 'react';

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
 * (AC-04, AC-20).
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
 * had when the row was first built. So every cell that reads translations, the
 * actor's Permissions, or a query is its own component, and this file resolves
 * only what a row is keyed by: the orders each line expands into.
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

  const onExpandedChange = (keys: Selection): void => setExpandedKeys(keys);

  const renderCustomerOrderRow = (order: CustomerOrder): ReactElement => (
    <Table.Row id={order.id} key={order.id} textValue={order.customerName}>
      <Table.Cell className="pl-12" textValue={order.customerName}>
        <span className="inline-flex items-center gap-2">
          <CornerDownRightIcon />
          {order.customerName}
        </span>
      </Table.Cell>
      <Table.Cell>{order.outstandingQuantity}</Table.Cell>
      <Table.Cell>{order.neededBy}</Table.Cell>
      <Table.Cell />
      <Table.Cell />
      <Table.Cell>
        <CustomerOrderActionsMenu
          order={order}
          onAmend={onAmend}
          onCancel={onCancel}
        />
      </Table.Cell>
    </Table.Row>
  );

  const renderDemandRow = (line: DemandLine): ReactElement => (
    <Table.Row id={line.itemId} key={line.itemId} textValue={line.sku}>
      <Table.Cell textValue={line.sku}>
        {({ hasChildItems, isExpanded, isTreeColumn }) => (
          <div className="flex items-center gap-2">
            <Conditional when={hasChildItems && isTreeColumn}>
              <DemandDisclosureButton isExpanded={isExpanded} line={line} />
            </Conditional>
            <div>
              <p className="font-semibold">{line.sku}</p>
              <p className="text-sm text-muted">{line.description}</p>
            </div>
          </div>
        )}
      </Table.Cell>
      <Table.Cell>{line.totalOutstandingQuantity}</Table.Cell>
      <Table.Cell>{line.earliestNeededBy}</Table.Cell>
      <Table.Cell>{line.onHandQuantity}</Table.Cell>
      <Table.Cell>
        <CoverageChips coverage={line.coverage} />
      </Table.Cell>
      {/* Recording further demand is offered once, at the destination, by
          `RecordDemandAction`, so this Item-level cell stays reserved rather
          than duplicating that trigger per row; the sub-rows below carry the
          per-order menu. */}
      <Table.Cell />
      <Table.Collection items={customerOrdersByItem[line.itemId] ?? []}>
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
          <Table.Body items={demandLines}>{renderDemandRow}</Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
};
