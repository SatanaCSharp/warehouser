import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { CorrectCustomerDialog } from 'modules/customer/components/customer-directory/components/customers/CorrectCustomerDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { Customer, CustomerUpdate } from '@warehouser/contracts/customers';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// delivery-addresses R8 — AC-03b and AC-03c. Never opened by any prior spec.
// `customer-api.spec.ts`:317 only proves the endpoint binds
// `customers.name_taken` to the `name` field; what is pinned here is that this
// dialog actually shows that binding to the member, on the field, in words
// naming the value it will not accept.

const north: Customer = {
  id: '00000000-0000-4000-8000-000000000201',
  name: 'Nordwind Logistik GmbH',
  deactivatedAt: null,
  mainDeliveryAddressId: null,
  deliveryAddresses: [],
  recordedByUserId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
};

const renderDialog = (
  result: MutationResult = { data: {} },
): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: CustomerUpdate) => Promise<MutationResult>>()
    .mockResolvedValue(result);
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <CorrectCustomerDialog customer={north} onSave={onSave} />
    </DialogHost>,
  );
  return { onClose, onSave };
};

const openedDialog = (): HTMLElement =>
  screen.getByRole('dialog', {
    name: 'Correct the name of Nordwind Logistik GmbH',
  });

describe('CorrectCustomerDialog', () => {
  it('submits the corrected name and closes (AC-03b)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = openedDialog();
    const nameField = within(dialog).getByLabelText('Customer name');
    await user.clear(nameField);
    await user.type(nameField, 'Nordwind Logistics GmbH');
    await user.click(within(dialog).getByRole('button', { name: 'Save name' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ name: 'Nordwind Logistics GmbH' }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // AC-03c — the server names no field for `customers.name_taken`; the
  // endpoint binds it to `name` (`customerNameFieldErrors`), and this asserts
  // the dialog actually shows it there, naming the value refused.
  it('marks the name field with the customers.name_taken refusal, and leaves the customer unchanged (AC-03c)', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({
      error: {
        code: ErrorCode.CUSTOMERS_NAME_TAKEN,
        fieldErrors: { name: 'nameTaken' },
      },
    });

    const dialog = openedDialog();
    const nameField = within(dialog).getByLabelText('Customer name');
    await user.clear(nameField);
    await user.type(nameField, 'Südsee Handel AG');
    await user.click(within(dialog).getByRole('button', { name: 'Save name' }));

    expect(
      await within(dialog).findByText(
        '“Südsee Handel AG” already names a customer in this warehouse. A customer name identifies at most one customer here.',
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('blocks a blank name: no request is made and the field says so', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = openedDialog();
    const nameField = within(dialog).getByLabelText('Customer name');
    await user.clear(nameField);
    await user.click(within(dialog).getByRole('button', { name: 'Save name' }));

    expect(
      await within(dialog).findByText('Enter a customer name.'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
