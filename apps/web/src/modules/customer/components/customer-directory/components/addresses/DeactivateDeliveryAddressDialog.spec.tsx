import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CustomerDeliveryAddress } from '@warehouser/contracts/customers';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { DeactivateDeliveryAddressDialog } from 'modules/customer/components/customer-directory/components/addresses/DeactivateDeliveryAddressDialog';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// delivery-addresses R8 — AC-06's address half (AC-06a/AC-06b) and AC-07's
// refusal. `CustomerDirectory.spec.tsx` opens this dialog only to assert it
// carries no `<form>`; it never confirms and never asserts an outcome. Never
// opened any other way.

const mainAddress: CustomerDeliveryAddress = {
  id: '00000000-0000-4000-8000-000000000301',
  customerId: '00000000-0000-4000-8000-000000000201',
  addressText: 'Hafenstraße 14, 20457 Hamburg',
  accessNotes: null,
  isMain: true,
  deactivatedAt: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
};

const ordinaryAddress: CustomerDeliveryAddress = {
  ...mainAddress,
  id: '00000000-0000-4000-8000-000000000302',
  addressText: 'Dockweg 3, 20457 Hamburg',
  isMain: false,
};

const renderDialog = (
  address: CustomerDeliveryAddress,
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
      <DeactivateDeliveryAddressDialog
        address={address}
        onConfirm={onConfirm}
      />
    </DialogHost>,
  );
  return { onClose, onConfirm };
};

const openedDialog = (): HTMLElement =>
  screen.getByRole('alertdialog', {
    name: 'Deactivate this delivery address?',
  });

describe('DeactivateDeliveryAddressDialog', () => {
  it('confirms with no value to submit, then closes (AC-06a)', async () => {
    const user = userEvent.setup();
    const { onClose, onConfirm } = renderDialog(ordinaryAddress);

    const dialog = openedDialog();
    expect(dialog.querySelector('form')).toBeNull();
    await user.click(
      within(dialog).getByRole('button', { name: 'Deactivate address' }),
    );

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('warns that deactivating the Main address moves the flag (AC-06b)', () => {
    renderDialog(mainAddress);
    expect(
      screen.getByText(/one of the remaining active addresses becomes/iu),
    ).toBeVisible();
  });

  it('stays silent about the Main flag when the address is not Main', () => {
    renderDialog(ordinaryAddress);
    expect(
      screen.queryByText(/one of the remaining active addresses becomes/iu),
    ).not.toBeInTheDocument();
  });

  // R9 (review-2026-09-04 finding 6, AC-06b) — the dialog used to promise
  // "You will be told which", but nothing ever named the promoted address:
  // the success toast only ever carried the Customer's name
  // (`shared/alerts/mutation-actions.ts`), and naming a specific address in a
  // toast would put confidential free text (spec.md §6.1) on a surface that
  // outlives the dialog. The promise is dropped rather than kept with a
  // notification this product does not send.
  it('does not promise a notification of which address becomes Main', () => {
    renderDialog(mainAddress);
    expect(
      screen.queryByText(/you will be told which/iu),
    ).not.toBeInTheDocument();
  });

  // design-handoff.md §Component mapping (`ee6Ez` `Zzn8c`) — the body is two
  // panels rather than a run of bare paragraphs: a neutral one for what
  // survives the withdrawal, and the Main-flag warning beside it.
  it('states what stays in its own panel, beside the Main-flag warning', () => {
    renderDialog(mainAddress);

    const dialog = openedDialog();
    expect(within(dialog).getByText('What stays')).toBeVisible();
    expect(
      within(dialog).getByText('This is the main delivery address'),
    ).toBeVisible();
  });

  // design-handoff.md §Component mapping — "Destructive primaries are solid
  // `danger`". The dialog used to override `ConfirmAlertDialog`'s default with
  // a `primary` confirm; the shared default is what the design draws.
  it('confirms with the shared danger treatment rather than a primary one', () => {
    renderDialog(ordinaryAddress);

    const confirm = within(openedDialog()).getByRole('button', {
      name: 'Deactivate address',
    });
    // HeroUI names a Button's variant in a BEM class it documents as its
    // styling contract (`.heroui-docs/react/components/(buttons)/button.mdx`
    // §"Styling Reference"), which is the only place the choice is observable
    // from the DOM.
    expect(confirm).toHaveClass('button--danger');
    expect(confirm).not.toHaveClass('button--primary');
  });

  // AC-07 — the Customer's last active address is refused, and this is the
  // one dialog that shows the member the way forward.
  it('names the AC-07 rule and the order to follow when it is the last active address', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog(ordinaryAddress, {
      error: { code: ErrorCode.CUSTOMERS_LAST_ACTIVE_DELIVERY_ADDRESS },
    });

    const dialog = openedDialog();
    await user.click(
      within(dialog).getByRole('button', { name: 'Deactivate address' }),
    );

    expect(
      await within(dialog).findByText(
        'A customer always keeps at least one active delivery address. Add the replacement address first, then deactivate this one.',
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
