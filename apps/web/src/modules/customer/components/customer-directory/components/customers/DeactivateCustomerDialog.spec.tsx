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
  outstandingOrderCount = 1,
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
      <DeactivateCustomerDialog
        customer={north}
        outstandingOrderCount={outstandingOrderCount}
        onConfirm={onConfirm}
      />
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

  // design-handoff.md §Component mapping (`ee6Ez` `E71Vi`) — the body is two
  // panels, not a run of bare paragraphs: a neutral one for what survives the
  // withdrawal and a warning one for what is still waiting on it.
  it('states what stays and what is still waiting in two panels', () => {
    renderDialog({ data: {} }, 3);

    const dialog = openedDialog();
    expect(within(dialog).getByText('What stays')).toBeVisible();
    expect(
      within(dialog).getByText(
        'This customer has 3 unfulfilled orders. Deactivating does not fulfil, cancel or hide them.',
      ),
    ).toBeVisible();
  });

  // A Customer waiting for nothing has nothing to be warned about, so the
  // warning panel is withheld rather than shown counting zero.
  it('withholds the still-waiting panel when the Customer awaits nothing', () => {
    renderDialog({ data: {} }, 0);

    const dialog = openedDialog();
    expect(within(dialog).getByText('What stays')).toBeVisible();
    expect(
      within(dialog).queryByText(/unfulfilled order/iu),
    ).not.toBeInTheDocument();
  });

  // design-handoff.md §Component mapping — "Destructive primaries are solid
  // `danger`". The dialog used to override `ConfirmAlertDialog`'s default with
  // a `primary` confirm; the shared default is what the design draws.
  it('confirms with the shared danger treatment rather than a primary one', () => {
    renderDialog();

    const confirm = within(openedDialog()).getByRole('button', {
      name: 'Deactivate customer',
    });
    // HeroUI names a Button's variant in a BEM class it documents as its
    // styling contract (`.heroui-docs/react/components/(buttons)/button.mdx`
    // §"Styling Reference"), which is the only place the choice is observable
    // from the DOM.
    expect(confirm).toHaveClass('button--danger');
    expect(confirm).not.toHaveClass('button--primary');
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
