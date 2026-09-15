import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CustomerOrderCreate } from '@warehouser/contracts/customer-orders';
import type { Customer } from '@warehouser/contracts/customers';
import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { customerApi } from 'modules/customer/api/customer-api';
import { RecordCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/RecordCustomerOrderDialog';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { DialogHost } from 'shared/components/DialogHost';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { selectHeroOption } from 'test/hero-select';
import { renderInEnteredWarehouse } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// AC-01 / AC-02 / AC-02a and BRIEF §A. What this suite pins is that a refusal
// names the value it will not accept **on the field it is about**:
//
//  - a Zod rejection arrives already keyed by field (`quantity: tooSmall`),
//    because the server lifts `details.fields` and `api-client.ts` normalizes
//    it into `fieldErrors`;
//  - AC-02a's "that date has already passed" is a *domain* refusal decided
//    against the server's clock, so it names no Zod field and is bound to
//    `neededBy` by the endpoint's `transformErrorResponse`;
//  - a refusal that names no field at all still has to say something.
//
// The dialog is rendered with no Item fixture: the picker's own contents are
// `ItemPicker`'s to prove, and none of the above depends on them.

const renderDialog = (
  result: MutationResult,
): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: CustomerOrderCreate) => Promise<MutationResult>>()
    .mockResolvedValue(result);
  // The dialog reads the Item picker's collection, which is Warehouse-scoped,
  // so it needs an entered-Warehouse match rather than a bare store.
  renderInEnteredWarehouse(
    <DialogHost onClose={onClose}>
      <RecordCustomerOrderDialog
        presetItemId="00000000-0000-4000-8000-000000000101"
        onSave={onSave}
      />
    </DialogHost>,
    authenticatedStore(),
    accessIds.warehouse,
  );
  return { onClose, onSave };
};

/**
 * The calendar cell for the current day. HeroUI's popover stays `aria-hidden`
 * while it is entering and jsdom never resolves that transition, so the open
 * calendar is only reachable with `{ hidden: true }` — the same reason
 * `test/hero-select.ts` gives. Today is picked rather than a fixed date so the
 * suite does not expire.
 */
const todayCell = (): Promise<HTMLElement> =>
  screen.findByRole('button', { hidden: true, name: /today/iu });

/** Fills the two free-text fields and submits; the Item is preset. */
const submitWith = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  quantity: string,
): Promise<void> => {
  await user.type(
    within(dialog).getByLabelText(/customer/iu),
    'Nordwind Logistik GmbH',
  );
  const quantityField = within(dialog).getByLabelText(/quantity/iu);
  await user.clear(quantityField);
  await user.type(quantityField, quantity);
  await user.click(
    within(dialog).getByRole('button', { name: /record demand/iu }),
  );
};

describe('RecordCustomerOrderDialog', () => {
  it('names what it records and carries helper text on every field', async () => {
    renderDialog({ data: {} });

    const dialog = await screen.findByRole('dialog', {
      name: 'Record what a customer is waiting for',
    });
    expect(
      within(dialog).getByText(
        'The end customer waiting for the goods, typed by hand. No customer is created or matched for it.',
      ),
    ).toBeInTheDocument();
    // F12 — the Item helper is the field's own description, not a paragraph
    // that merely sits under it: `toHaveAccessibleDescription` resolves it the
    // way an assistive technology does, so a sentence rendered beside the
    // control rather than attached to it fails here.
    expect(
      within(dialog).getByRole('button', { name: /item/iu }),
    ).toHaveAccessibleDescription(
      'Only active items of this warehouse are offered.',
    );
    expect(
      within(dialog).getByText('A date that has not already passed.'),
    ).toBeInTheDocument();
  });

  it('never submits an empty needed-by date: no request is made and the field says why', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({ data: {} });

    const dialog = await screen.findByRole('dialog');
    await submitWith(user, dialog, '800');

    expect(
      await within(dialog).findByText(
        'Enter the date the customer needs the goods by.',
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  // AC-02 — the server's Zod refusal names its own field, so the message lands
  // under that field rather than as one sentence about the whole form.
  it('marks the quantity field with the rule the server refused it on (AC-02)', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({
      error: { code: 'request.invalid', fieldErrors: { quantity: 'tooSmall' } },
    });

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/customer/iu),
      'Nordwind Logistik GmbH',
    );
    const quantityField = within(dialog).getByLabelText(/quantity/iu);
    await user.clear(quantityField);
    await user.type(quantityField, '0');
    await user.click(
      within(dialog).getByRole('button', { name: /open calendar/iu }),
    );
    await user.click(await todayCell());
    await user.click(
      within(dialog).getByRole('button', { name: /record demand/iu }),
    );

    expect(
      await within(dialog).findByText('A whole number greater than zero.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // AC-02a — a domain refusal, not a Zod one. It reaches the field only because
  // the endpoint binds it, which is what `fieldErrorsForCode` exists for.
  it('marks the needed-by field when the server refuses a date that has passed (AC-02a)', async () => {
    const user = userEvent.setup();
    renderDialog({
      error: {
        code: ErrorCode.CUSTOMER_ORDERS_NEEDED_BY_IN_PAST,
        fieldErrors: { neededBy: 'inPast' },
      },
    });

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/customer/iu),
      'Nordwind Logistik GmbH',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /open calendar/iu }),
    );
    await user.click(await todayCell());
    await user.click(
      within(dialog).getByRole('button', { name: /record demand/iu }),
    );

    expect(
      // The helper text under the field says the same rule in the abstract, so
      // the refusal is identified by the half only it carries.
      await within(dialog).findByText(/behind this warehouse's own clock/iu),
    ).toBeInTheDocument();
  });

  it('closes only once the order has actually been recorded (AC-01)', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ data: {} });

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/customer/iu),
      'Nordwind Logistik GmbH',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /open calendar/iu }),
    );
    await user.click(await todayCell());
    await user.click(
      within(dialog).getByRole('button', { name: /record demand/iu }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

// --- delivery-addresses T22 — recording against a Customer ---------------------------------------
//
// AC-11 and AC-11a are two whole ways of recording demand, not one and a
// degraded one: a member holding `CUSTOMERS:WATCH` names a Customer and
// optionally one of its Delivery Addresses, and a member without it types a
// name — which names no Customer, carries no address, and creates and matches
// none (AC-24). The two are mutually exclusive on the way out, because
// `chk_customer_orders_customer_identity` admits exactly one of them.
//
// The pickers themselves are `modules/customer`'s to prove
// (`CustomerPicker.spec.tsx`, `CustomerDeliveryAddressPicker.spec.tsx`); what
// is pinned here is that this dialog reaches for them, gates them, and sends
// what they choose.

const customerIds = {
  north: '00000000-0000-4000-8000-000000000701',
  hafen: '00000000-0000-4000-8000-000000000702',
  dock: '00000000-0000-4000-8000-000000000703',
} as const;

const northCustomer: Customer = {
  id: customerIds.north,
  name: 'Nordwind Logistik GmbH',
  deactivatedAt: null,
  mainDeliveryAddressId: customerIds.hafen,
  deliveryAddresses: [
    {
      id: customerIds.hafen,
      customerId: customerIds.north,
      addressText: 'Hafenstraße 14, 20457 Hamburg',
      accessNotes: null,
      isMain: true,
      deactivatedAt: null,
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: '2026-08-01T09:00:00.000Z',
    },
    {
      id: customerIds.dock,
      customerId: customerIds.north,
      addressText: 'Dockweg 3, 20457 Hamburg',
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

const renderDialogFor = (
  permissionIds: readonly PermissionId[],
): ReturnType<typeof vi.fn> => {
  stubAccessServer({ permissionIds });
  const store = authenticatedStore();
  void store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: [...permissionIds],
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
    .fn<(input: CustomerOrderCreate) => Promise<MutationResult>>()
    .mockResolvedValue({ data: {} });
  renderInEnteredWarehouse(
    <DialogHost onClose={vi.fn()}>
      <RecordCustomerOrderDialog
        presetItemId="00000000-0000-4000-8000-000000000101"
        onSave={onSave}
      />
    </DialogHost>,
    store,
    accessIds.warehouse,
  );
  return onSave;
};

describe('RecordCustomerOrderDialog customer identity (AC-11, AC-11a)', () => {
  it('records the order against a chosen Customer and Delivery Address, never a typed name too (AC-11)', async () => {
    const user = userEvent.setup();
    const onSave = renderDialogFor(Object.values(PermissionId));

    const dialog = await screen.findByRole('dialog', {
      name: 'Record what a customer is waiting for',
    });
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /customer$/iu }),
      'Nordwind Logistik GmbH',
    );
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /delivery address/iu }),
      'Dockweg 3, 20457 Hamburg',
    );

    // The typed-name field is out of play while a Customer is named: the two
    // are mutually exclusive, so the member is not left composing both.
    expect(within(dialog).getByLabelText(/customer name/iu)).toBeDisabled();

    const quantity = within(dialog).getByLabelText(/quantity/iu);
    await user.clear(quantity);
    await user.type(quantity, '500');
    await user.click(
      within(dialog).getByRole('button', { name: /open calendar/iu }),
    );
    await user.click(await todayCell());
    await user.click(
      within(dialog).getByRole('button', { name: /record demand/iu }),
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const input = onSave.mock.calls[0][0] as CustomerOrderCreate;
    expect(input.customerId).toBe(customerIds.north);
    expect(input.customerDeliveryAddressId).toBe(customerIds.dock);
    expect(input.customerName).toBeUndefined();
  });

  it('offers no customer or address field at all without CUSTOMERS:WATCH (AC-09a, AC-11a)', async () => {
    renderDialogFor([PermissionId.CUSTOMER_ORDERS_CREATE]);

    const dialog = await screen.findByRole('dialog', {
      name: 'Record what a customer is waiting for',
    });
    // Absent rather than disabled: typing a name is a whole way of recording
    // demand, and nothing here hints that a customer record exists to choose.
    expect(
      within(dialog).queryByRole('button', { name: /customer$/iu }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: /delivery address/iu }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/customer name/iu)).toBeEnabled();
  });
});
