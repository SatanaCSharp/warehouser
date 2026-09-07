import { CustomerCard } from 'modules/customer/components/customer-directory/components/customers/CustomerCard';

import type { Customer } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

export type CustomerCardListProps = {
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
 *
 * It opens no dialog and runs no mutation. The design puts the Customer's
 * actions kebab on the **detail header** rather than on every card, so the
 * `useActionDialog` controller and the `ActionDialogHost` that used to sit
 * here live with the trigger, in `CustomerDetailHeader`
 * (`docs/system/adr/27-08-2026-reducer-driven-action-dialogs.md`: the surface
 * that holds the controller is the narrowest ancestor of the controls that
 * open it). What is left here is the collection and nothing else.
 */
export const CustomerCardList = ({
  customers,
  label,
  selectedCustomerId,
  onSelect,
}: CustomerCardListProps): ReactElement => (
  <ul aria-label={label} className="mt-4 grid gap-3">
    {customers.map((customer) => (
      <CustomerCard
        key={customer.id}
        customer={customer}
        isSelected={customer.id === selectedCustomerId}
        onSelect={onSelect}
      />
    ))}
  </ul>
);
