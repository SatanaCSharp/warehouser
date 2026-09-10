import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CustomerOrder,
  CustomerOrderRedirect,
} from '@warehouser/contracts/customer-orders';
import type { Customer } from '@warehouser/contracts/customers';
import { PermissionId } from '@warehouser/shared-types/enums';
import { customerApi } from 'modules/customer/api/customer-api';
import { RedirectCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/RedirectCustomerOrderDialog';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { DialogHost } from 'shared/components/DialogHost';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// The dialog suppresses its refusal alert whenever the form carries a field
// error, on the stated assumption that "the field explains it". This suite
// pins the other half of that bargain: whenever the field is marked, the
// sentence explaining why is on screen in the language the member reads, not
// an empty `FieldError` under a red control.

const ids = {
  customer: '00000000-0000-4000-8000-000000000701',
  hafen: '00000000-0000-4000-8000-000000000702',
  dock: '00000000-0000-4000-8000-000000000703',
  item: '00000000-0000-4000-8000-000000000240',
} as const;

const HAFEN_TEXT = 'Hafenstraße 14, 20457 Hamburg';
const DOCK_TEXT = 'Dockweg 3, 20457 Hamburg';

const northCustomer: Customer = {
  id: ids.customer,
  name: 'Nordwind Logistik GmbH',
  deactivatedAt: null,
  mainDeliveryAddressId: ids.hafen,
  deliveryAddresses: [
    {
      id: ids.hafen,
      customerId: ids.customer,
      addressText: HAFEN_TEXT,
      accessNotes: null,
      isMain: true,
      deactivatedAt: null,
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: '2026-08-01T09:00:00.000Z',
    },
    {
      id: ids.dock,
      customerId: ids.customer,
      addressText: DOCK_TEXT,
      accessNotes: null,
      isMain: false,
      deactivatedAt: null,
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: '2026-08-01T09:00:00.000Z',
    },
  ],
  recordedByUserId: accessIds.actingUser,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
};

const commonOrder = {
  itemId: ids.item,
  quantity: 1000,
  outstandingQuantity: 1000,
  neededBy: '2026-09-01',
  state: 'unfulfilled' as const,
  cancellationReason: null,
  recordedByUserId: accessIds.actingUser,
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
  id: '00000000-0000-4000-8000-000000000801',
};

/** An order naming a Customer and going to that Customer's Main address. */
const namedOrder: CustomerOrder = {
  ...commonOrder,
  customer: { id: ids.customer, name: northCustomer.name },
  customerName: null,
  destination: {
    deliveryAddressId: ids.hafen,
    addressText: HAFEN_TEXT,
    accessNotes: null,
    isMain: true,
    deactivatedAt: null,
  },
};

/**
 * The same order with nowhere stated to redirect from, so the one field opens
 * empty and its `required` rule is what the empty submit meets.
 */
const undestinedOrder: CustomerOrder = {
  ...commonOrder,
  customer: null,
  customerName: null,
  destination: null,
};

const renderDialog = (
  order: CustomerOrder,
  result: MutationResult = { data: {} },
): ReturnType<typeof vi.fn> => {
  stubAccessServer({ permissionIds: Object.values(PermissionId) });
  const store = authenticatedStore();
  void store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: Object.values(PermissionId),
        archivedAt: null,
      },
    ),
  );
  void store.dispatch(
    customerApi.util.upsertQueryData('listCustomers', accessIds.warehouse, [
      northCustomer,
    ]),
  );
  const onSave = vi
    .fn<(input: CustomerOrderRedirect) => Promise<MutationResult>>()
    .mockResolvedValue(result);
  renderInEnteredWarehouse(
    <DialogHost onClose={vi.fn()}>
      <RedirectCustomerOrderDialog order={order} onSave={onSave} />
    </DialogHost>,
    store,
    accessIds.warehouse,
  );
  return onSave;
};

describe('RedirectCustomerOrderDialog', () => {
  it('states why it will not submit an empty delivery address, not merely that it is invalid', async () => {
    const user = userEvent.setup();
    const onSave = renderDialog(undestinedOrder);

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: /redirect the order/iu }),
    );

    expect(
      await within(dialog).findByText('Choose a delivery address.'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the server-refused address rule on the field it marks', async () => {
    const user = userEvent.setup();
    renderDialog(namedOrder, {
      error: {
        code: 'request.invalid',
        fieldErrors: { customerDeliveryAddressId: 'invalid' },
      },
    });

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: /redirect the order/iu }),
    );

    // The refusal alert is suppressed as soon as the field is marked, so this
    // sentence is the only explanation the member is left with.
    expect(
      await within(dialog).findByText(
        'That delivery address is not one this customer offers.',
      ),
    ).toBeInTheDocument();
  });
});
