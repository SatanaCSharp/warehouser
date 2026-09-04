import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { DeactivateCustomerDialog } from 'modules/customer/components/customer-directory/components/customers/DeactivateCustomerDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { Customer } from '@warehouser/contracts/customers';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// delivery-addresses R8 — AC-06's Customer half. Never opened by any prior
// spec. Reactivation itself asks nothing (this component's own docblock), so
// it is a bare request run by `CustomerActionsMenu` rather than a dialog; that
// half of AC-06 — offered and works — is proven by
// `CustomerActionsMenu.spec.tsx`, colocated with the file that owns it. What
// this dialog owns is the confirmation and its refusal.

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
  onConfirm: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onConfirm = vi
    .fn<() => Promise<MutationResult>>()
    .mockResolvedValue(result);
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <DeactivateCustomerDialog customer={north} onConfirm={onConfirm} />
    </DialogHost>,
  );
  return { onClose, onConfirm };
};

const openedDialog = (): HTMLElement =>
  screen.getByRole('alertdialog', {
    name: 'Deactivate Nordwind Logistik GmbH?',
  });

describe('DeactivateCustomerDialog', () => {
  it('confirms deactivation with no value to submit, then closes (AC-06)', async () => {
    const user = userEvent.setup();
    const { onClose, onConfirm } = renderDialog();

    const dialog = openedDialog();
    expect(dialog.querySelector('form')).toBeNull();
    await user.click(
      within(dialog).getByRole('button', { name: 'Deactivate customer' }),
    );

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('states every AC-06 promise before the member commits', () => {
    renderDialog();

    const dialog = openedDialog();
    expect(
      within(dialog).getByText(/stays readable and keeps counting/iu),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/delivery addresses are left exactly/iu),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/no new customer can reuse it/iu),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/active again at any time/iu),
    ).toBeVisible();
  });

  it('shows the refused-deactivation reason and leaves the dialog open', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({
      error: { code: ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE },
    });

    const dialog = openedDialog();
    await user.click(
      within(dialog).getByRole('button', { name: 'Deactivate customer' }),
    );

    expect(
      await within(dialog).findByText(
        'This customer is not available. Nothing has changed.',
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
