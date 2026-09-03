import { CustomerCard } from 'modules/customer/components/customer-directory/components/customers/CustomerCard';

import type { Customer } from '@warehouser/contracts/customers';
import type { CustomerActionHandlers } from 'modules/customer/hooks/projections/useCustomerActions';
import type { ReactElement } from 'react';

export type CustomerCardListProps = CustomerActionHandlers & {
  customers: Customer[];
  /** Names the list for assistive technology. */
  label: string;
  selectedCustomerId: string | undefined;
  onSelect: (customerId: string) => void;
};

/**
 * The 340px customer column (`KRDln`), and the whole first screen at 390px
 * (`b7gaH9`): one `Delivery/Customer Card` per Customer.
 *
 * It is a list rather than a table at both viewports — a customer card carries
 * a name, a meta line and a chip, not a row of comparable cells — which is
 * also what design-handoff.md §Accessibility asks for ("lists for customer,
 * address and awaiting collections").
 */
export const CustomerCardList = ({
  customers,
  label,
  selectedCustomerId,
  onCorrect,
  onDeactivate,
  onSelect,
}: CustomerCardListProps): ReactElement => (
  <ul aria-label={label} className="mt-4 grid gap-3">
    {customers.map((customer) => (
      <CustomerCard
        key={customer.id}
        customer={customer}
        isSelected={customer.id === selectedCustomerId}
        onCorrect={onCorrect}
        onDeactivate={onDeactivate}
        onSelect={onSelect}
      />
    ))}
  </ul>
);
