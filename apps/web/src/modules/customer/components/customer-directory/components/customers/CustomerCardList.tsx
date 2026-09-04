import {
  useCorrectCustomerNameMutation,
  useDeactivateCustomerMutation,
} from 'modules/customer/api/customer-api';
import { CorrectCustomerDialog } from 'modules/customer/components/customer-directory/components/customers/CorrectCustomerDialog';
import { CustomerCard } from 'modules/customer/components/customer-directory/components/customers/CustomerCard';
import { DeactivateCustomerDialog } from 'modules/customer/components/customer-directory/components/customers/DeactivateCustomerDialog';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';

import type { Customer, CustomerUpdate } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/** Which per-Customer dialog a card's kebab opens. */
type CustomerDialogKind = 'correct' | 'deactivate';

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
 * It is its own **surface** in the reducer-driven sense, exactly as
 * `CustomerAddressBook` is for its rows: the narrowest common ancestor of the
 * cards that open these dialogs holds the `Kind` union, the `useActionDialog`
 * controller and the total `renderDialogs` lookup
 * (`docs/system/adr/27-08-2026-reducer-driven-action-dialogs.md`). Owning them
 * here is what keeps the two reports one hop from the kebab that sends them —
 * list → card → menu — rather than four from the destination
 * (`writing-web-components.md` §4).
 *
 * The Warehouse the customer-level mutations are addressed to is read here for
 * the same reason: it is used here, so it is not threaded down to be used here
 * either.
 */
export const CustomerCardList = ({
  customers,
  label,
  selectedCustomerId,
  onSelect,
}: CustomerCardListProps): ReactElement => {
  const warehouseId = useEnteredWarehouse();
  const dialog = useActionDialog<CustomerDialogKind, Customer>();
  const [correctCustomerName] = useCorrectCustomerNameMutation();
  const [deactivateCustomer] = useDeactivateCustomerMutation();

  // The two reports a card's kebab sends upward. Each only names the Customer
  // a dialog was chosen for, which is the single thing a cached row renderer
  // may close over
  // (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
  const onCorrect = (customer: Customer): void =>
    dialog.open('correct', customer);
  const onDeactivate = (customer: Customer): void =>
    dialog.open('deactivate', customer);

  // Each command carries what its success toast names the Customer by, beside
  // the id that addresses it: a correction is reported by the name it leaves
  // behind, which is what the member just committed. The address text never
  // rides along — it is confidential and a toast outlives the dialog that
  // showed it (spec.md §6.1).
  const onSaveCorrection =
    (customer: Customer) =>
    (input: CustomerUpdate): Promise<MutationResult> =>
      correctCustomerName({
        customerName: input.name,
        warehouseId: warehouseId ?? '',
        customerId: customer.id,
        input,
      });

  const onConfirmDeactivate =
    (customer: Customer) => (): Promise<MutationResult> =>
      deactivateCustomer({
        customerName: customer.name,
        warehouseId: warehouseId ?? '',
        customerId: customer.id,
      });

  return (
    <>
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

      <ActionDialogHost
        controller={dialog}
        renderDialogs={{
          correct: (customer) => (
            <CorrectCustomerDialog
              customer={customer}
              onSave={onSaveCorrection(customer)}
            />
          ),
          deactivate: (customer) => (
            <DeactivateCustomerDialog
              customer={customer}
              onConfirm={onConfirmDeactivate(customer)}
            />
          ),
        }}
      />
    </>
  );
};
