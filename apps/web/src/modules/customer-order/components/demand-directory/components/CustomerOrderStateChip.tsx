import { Chip } from '@heroui/react';
import type {
  CustomerOrder,
  CustomerOrderState,
} from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type CustomerOrderStateChipProps = { order: CustomerOrder };

/** The three lifecycle states, as a total lookup rather than a chain. */
const stateColors: Record<
  CustomerOrderState,
  'danger' | 'default' | 'success'
> = {
  unfulfilled: 'default',
  fulfilled: 'success',
  cancelled: 'danger',
};

const stateLabels: Record<CustomerOrderState, string> = {
  unfulfilled: 'chips.unfulfilled',
  fulfilled: 'chips.fulfilled',
  cancelled: 'chips.cancelled',
};

/**
 * The lifecycle chip one expanded Customer Order carries (design frame
 * `G6jhw`, sub-row: `Unfulfilled`). The state is named in words, never by
 * colour alone (design-handoff.md §Accessibility).
 *
 * It is a component rather than markup inlined in the row renderer because it
 * translates: a React Aria collection caches a row's element tree per record,
 * so a label resolved above it would keep the language that was active when the
 * row was first built
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const CustomerOrderStateChip = ({
  order,
}: CustomerOrderStateChipProps): ReactElement => {
  const { t } = useTranslation('customer-order');

  return (
    <Chip color={stateColors[order.state]} size="sm" variant="soft">
      {t(stateLabels[order.state])}
    </Chip>
  );
};
