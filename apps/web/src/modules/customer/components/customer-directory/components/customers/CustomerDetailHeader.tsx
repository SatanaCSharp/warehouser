import { Card } from '@heroui/react';
import type {
  CustomerDetail,
  CustomerUpdate,
} from '@warehouser/contracts/customers';
import {
  useCorrectCustomerNameMutation,
  useDeactivateCustomerMutation,
} from 'modules/customer/api/customer-api';
import { CorrectCustomerDialog } from 'modules/customer/components/customer-directory/components/customers/CorrectCustomerDialog';
import { CustomerActionsMenu } from 'modules/customer/components/customer-directory/components/customers/CustomerActionsMenu';
import { DeactivateCustomerDialog } from 'modules/customer/components/customer-directory/components/customers/DeactivateCustomerDialog';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';

/** Which per-Customer dialog the detail header's kebab opens. */
type CustomerDialogKind = 'correct' | 'deactivate';

export type CustomerDetailHeaderProps = {
  detail: CustomerDetail;
};

/**
 * The identity slot of the opened Customer's pane (frame `KRDln`): its name,
 * and the kebab carrying everything that can be done to the Customer itself.
 *
 * **The kebab belongs here and not on the list cards.** The design draws the
 * cards as a plain 340px collection — a name and a meta line — and puts the
 * one actions trigger on the detail header, where the Customer being acted on
 * is the one on screen. Repeating a kebab on every card multiplied the
 * trigger by the size of the collection and offered a destructive action for a
 * Customer the member had not opened.
 *
 * It is its own **surface** in the reducer-driven sense: it holds the `Kind`
 * union, the `useActionDialog` controller and the total `renderDialogs`
 * lookup, because the dialogs it opens are opened from here and from nowhere
 * else (`docs/system/adr/27-08-2026-reducer-driven-action-dialogs.md`). The
 * Warehouse the customer-level mutations are addressed to is read here for the
 * same reason: it is used here (`writing-web-components.md` §4).
 *
 * Holding the detail rather than the list's `Customer` is what lets the
 * deactivation confirmation say how many Unfulfilled Customer Orders are still
 * waiting: that count is on `CustomerDetail` and on nothing the list carries.
 */
export const CustomerDetailHeader = ({
  detail,
}: CustomerDetailHeaderProps): ReactElement => {
  const warehouseId = useEnteredWarehouse();
  const dialog = useActionDialog<CustomerDialogKind, CustomerDetail>();
  const [correctCustomerName] = useCorrectCustomerNameMutation();
  const [deactivateCustomer] = useDeactivateCustomerMutation();

  // The two reports the kebab sends. The header draws one Customer, so the
  // subject a dialog is opened for is the detail this component was given —
  // the menu's report says *which* action was chosen and nothing more.
  const onCorrect = (): void => dialog.open('correct', detail);
  const onDeactivate = (): void => dialog.open('deactivate', detail);

  // Each command carries what its success toast names the Customer by, beside
  // the id that addresses it: a correction is reported by the name it leaves
  // behind, which is what the member just committed. The address text never
  // rides along — it is confidential and a toast outlives the dialog that
  // showed it (spec.md §6.1).
  const onSaveCorrection =
    (customer: CustomerDetail) =>
    (input: CustomerUpdate): Promise<MutationResult> =>
      correctCustomerName({
        customerName: input.name,
        warehouseId: warehouseId ?? '',
        customerId: customer.id,
        input,
      });

  const onConfirmDeactivate =
    (customer: CustomerDetail) => (): Promise<MutationResult> =>
      deactivateCustomer({
        customerName: customer.name,
        warehouseId: warehouseId ?? '',
        customerId: customer.id,
      });

  return (
    <>
      <Card.Header className="flex flex-row items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-2xl font-semibold text-foreground">
          {detail.name}
        </h2>
        <CustomerActionsMenu
          customer={detail}
          onCorrect={onCorrect}
          onDeactivate={onDeactivate}
        />
      </Card.Header>

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
              outstandingOrderCount={customer.awaitingCustomerOrders.length}
              onConfirm={onConfirmDeactivate(customer)}
            />
          ),
        }}
      />
    </>
  );
};
