import { Button, Chip } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CustomerOrderRow } from 'modules/customer-order/components/demand-directory/components/CustomerOrderRow';
import { useUnfulfilledCustomerOrders } from 'modules/customer-order/hooks/queries/useUnfulfilledCustomerOrders';
import { Conditional } from 'shared/components/Conditional';
import { ChevronDownIcon, ChevronUpIcon } from 'shared/icons';

import type {
  CustomerOrder,
  DemandLine,
} from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';

export type DemandRowProps = {
  line: DemandLine;
  onAmend: (order: CustomerOrder) => void;
  onCancel: (order: CustomerOrder) => void;
};

const itemLabel = (line: DemandLine): string =>
  `${line.sku}, ${line.description}`;

/**
 * One Item's consolidated Unfulfilled demand (design-handoff.md
 * `Ordering/Demand Row`, `prm7R`): the six cells — item, outstanding,
 * earliest needed by, on hand, covered by, actions — plus the disclosure
 * that expands its Unfulfilled Customer Orders (AC-04, AC-20). The actions
 * cell carries the sub-rows' amend/cancel controls once expanded; recording
 * further demand is offered once, at the destination, by
 * `RecordDemandAction`, so this row's own actions cell is reserved rather
 * than duplicating that trigger per Item.
 *
 * The disclosure is transient UI state nothing else reads, so it is owned
 * here rather than by `DemandDirectory` (`writing-web-components.md` §8);
 * expanding it is also what triggers the sub-rows' own read, through
 * `useUnfulfilledCustomerOrders`'s `skip`.
 */
export const DemandRow = ({
  line,
  onAmend,
  onCancel,
}: DemandRowProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const [isExpanded, setIsExpanded] = useState(false);
  const customerOrders = useUnfulfilledCustomerOrders(line.itemId, {
    skip: !isExpanded,
  });

  const onToggleExpanded = (): void => setIsExpanded((expanded) => !expanded);

  const disclosureIcon = isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />;
  const disclosureLabel = t(
    isExpanded ? 'demand.disclosure.hide' : 'demand.disclosure.show',
    { count: line.unfulfilledCustomerOrderCount, item: itemLabel(line) },
  );

  const coverageChips =
    line.coverage.length === 0 ? (
      <span className="text-sm text-muted">{t('demand.coverage.none')}</span>
    ) : (
      line.coverage.map((entry) => (
        <Chip
          key={entry.purchaseDraftLineId}
          color="accent"
          size="sm"
          variant="soft"
        >
          {t('demand.coverage.chip', { quantity: entry.statedQuantity })}
        </Chip>
      ))
    );

  const subRows = customerOrders.map((order) => (
    <CustomerOrderRow
      key={order.id}
      order={order}
      onAmend={onAmend}
      onCancel={onCancel}
    />
  ));

  return (
    <>
      <tr className="border-b border-border">
        <td className="p-2">
          <div className="flex items-center gap-2">
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-expanded={isExpanded}
              aria-label={disclosureLabel}
              onPress={onToggleExpanded}
            >
              {disclosureIcon}
            </Button>
            <div>
              <p className="font-semibold">{line.sku}</p>
              <p className="text-sm text-muted">{line.description}</p>
            </div>
          </div>
        </td>
        <td className="p-2">{line.totalOutstandingQuantity}</td>
        <td className="p-2">{line.earliestNeededBy}</td>
        <td className="p-2">{line.onHandQuantity}</td>
        <td className="p-2">
          <div className="flex flex-wrap gap-1">{coverageChips}</div>
        </td>
        {/* eslint-disable-next-line jsx-a11y/control-has-associated-label --
            this `<td>` renders no control at all; recording further demand is
            offered once, at the destination, by `RecordDemandAction`, so this
            reserved cell stays empty (matching the passing `ItemRow.tsx`
            precedent). */}
        <td className="p-2" />
      </tr>
      <Conditional when={isExpanded}>{subRows}</Conditional>
    </>
  );
};
