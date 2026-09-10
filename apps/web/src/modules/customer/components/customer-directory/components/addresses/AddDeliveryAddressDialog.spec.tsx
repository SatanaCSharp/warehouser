import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CustomerDeliveryAddressCreate } from '@warehouser/contracts/customers';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { AddDeliveryAddressDialog } from 'modules/customer/components/customer-directory/components/addresses/AddDeliveryAddressDialog';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// delivery-addresses R8 — AC-04, including the `main: true` checkbox path,
// which is what the frontend review's blocking finding was about (findings 1
// and 5). Never opened by any prior spec.

const renderDialog = (
  result: MutationResult = { data: {} },
): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: CustomerDeliveryAddressCreate) => Promise<MutationResult>>()
    .mockResolvedValue(result);
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <AddDeliveryAddressDialog onSave={onSave} />
    </DialogHost>,
  );
  return { onClose, onSave };
};

const openedDialog = (): HTMLElement =>
  screen.getByRole('dialog', { name: 'Add a delivery address' });

describe('AddDeliveryAddressDialog', () => {
  it('adds an ordinary address, main false by default (AC-04)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = openedDialog();
    await user.type(
      within(dialog).getByLabelText('Delivery address'),
      'Dockweg 3, 20457 Hamburg',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Add address' }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        addressText: 'Dockweg 3, 20457 Hamburg',
        accessNotes: null,
        main: false,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // The load-bearing case: ticking Main is what the review found unsubmitted.
  it('submits main: true when the member ticks Main (AC-04)', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = openedDialog();
    await user.type(
      within(dialog).getByLabelText('Delivery address'),
      'Dockweg 3, 20457 Hamburg',
    );
    await user.type(
      within(dialog).getByLabelText(/access notes/iu),
      'Gate code 4711',
    );
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: "Make this the customer's main delivery address",
      }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Add address' }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        addressText: 'Dockweg 3, 20457 Hamburg',
        accessNotes: 'Gate code 4711',
        main: true,
      }),
    );
  });

  it('blocks a blank address: no request is made and the field says so', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = openedDialog();
    await user.click(
      within(dialog).getByRole('button', { name: 'Add address' }),
    );

    expect(
      await within(dialog).findByText(
        'Enter the address the goods are sent to.',
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('marks the address field when the server refuses a whitespace-only address', async () => {
    const user = userEvent.setup();
    renderDialog({
      error: {
        code: ErrorCode.CUSTOMERS_INVALID_INPUT,
        fieldErrors: { addressText: 'trimmed_non_empty' },
      },
    });

    const dialog = openedDialog();
    await user.type(within(dialog).getByLabelText('Delivery address'), '   ');
    await user.click(
      within(dialog).getByRole('button', { name: 'Add address' }),
    );

    expect(
      await within(dialog).findByText(
        'Enter the address the goods are sent to.',
      ),
    ).toBeInTheDocument();
  });
});
