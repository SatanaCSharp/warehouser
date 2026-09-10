import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CustomerCreate } from '@warehouser/contracts/customers';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { RecordCustomerDialog } from 'modules/customer/components/customer-directory/components/customers/RecordCustomerDialog';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// delivery-addresses R8 (independent review, `_review/review-2026-09-04.md`
// findings 1 and 5) — AC-01 and AC-02. This dialog was previously reachable
// from no spec at all: `CustomerDirectory.spec.tsx` never opened it.
//
// AC-01 (spec.md §5) — recording a Customer with a name and one Delivery
// Address stores it active with that address Main, in one transaction.
// AC-02 — a blank or whitespace-only name or address text is refused and the
// member is told which value it will not accept. A blank value never reaches
// `onSave` (react-hook-form's own `required`); a whitespace-only one does,
// because the trimmed-non-empty rule stays the server's
// (`RecordCustomerDialog.tsx`'s own docblock) — so that half is driven through
// the server refusal `onSave` is mocked to return.

const renderDialog = (
  result: MutationResult = { data: {} },
): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: CustomerCreate) => Promise<MutationResult>>()
    .mockResolvedValue(result);
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <RecordCustomerDialog onSave={onSave} />
    </DialogHost>,
  );
  return { onClose, onSave };
};

const openedDialog = (): HTMLElement =>
  screen.getByRole('dialog', { name: 'Record a customer' });

describe('RecordCustomerDialog', () => {
  it('records the customer with its one address as Main, then closes (AC-01)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = openedDialog();
    await user.type(
      within(dialog).getByLabelText('Customer name'),
      'Nordwind Logistik GmbH',
    );
    await user.type(
      within(dialog).getByLabelText('Delivery address'),
      'Hafenstraße 14, 20457 Hamburg',
    );
    await user.type(
      within(dialog).getByLabelText(/access notes/iu),
      'Gate code 4711',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Record customer' }),
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Nordwind Logistik GmbH',
      deliveryAddress: {
        addressText: 'Hafenstraße 14, 20457 Hamburg',
        accessNotes: 'Gate code 4711',
      },
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('submits no access notes as null, never as an empty string (AC-01)', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = openedDialog();
    await user.type(
      within(dialog).getByLabelText('Customer name'),
      'Nordwind Logistik GmbH',
    );
    await user.type(
      within(dialog).getByLabelText('Delivery address'),
      'Hafenstraße 14, 20457 Hamburg',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Record customer' }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryAddress: expect.objectContaining({ accessNotes: null }),
        }),
      ),
    );
  });

  it('blocks a blank name: no request is made and the field says so (AC-02)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = openedDialog();
    await user.type(
      within(dialog).getByLabelText('Delivery address'),
      'Hafenstraße 14, 20457 Hamburg',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Record customer' }),
    );

    expect(
      await within(dialog).findByText('Enter a customer name.'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('blocks a blank address: no request is made and the field says so (AC-02)', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = openedDialog();
    await user.type(
      within(dialog).getByLabelText('Customer name'),
      'Nordwind Logistik GmbH',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Record customer' }),
    );

    expect(
      await within(dialog).findByText(
        'Enter the address the goods are sent to.',
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('marks the name field when the server refuses a whitespace-only name (AC-02)', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({
      error: {
        code: ErrorCode.CUSTOMERS_INVALID_INPUT,
        fieldErrors: { name: 'trimmed_non_empty' },
      },
    });

    const dialog = openedDialog();
    await user.type(within(dialog).getByLabelText('Customer name'), '   ');
    await user.type(
      within(dialog).getByLabelText('Delivery address'),
      'Hafenstraße 14, 20457 Hamburg',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Record customer' }),
    );

    expect(
      await within(dialog).findByText('Enter a customer name.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('marks the address field when the server refuses a whitespace-only address (AC-02)', async () => {
    const user = userEvent.setup();
    renderDialog({
      error: {
        code: ErrorCode.CUSTOMERS_INVALID_INPUT,
        fieldErrors: { addressText: 'trimmed_non_empty' },
      },
    });

    const dialog = openedDialog();
    await userEvent.type(
      within(dialog).getByLabelText('Customer name'),
      'Nordwind Logistik GmbH',
    );
    await user.type(within(dialog).getByLabelText('Delivery address'), '   ');
    await user.click(
      within(dialog).getByRole('button', { name: 'Record customer' }),
    );

    expect(
      await within(dialog).findByText(
        'Enter the address the goods are sent to.',
      ),
    ).toBeInTheDocument();
  });
});
