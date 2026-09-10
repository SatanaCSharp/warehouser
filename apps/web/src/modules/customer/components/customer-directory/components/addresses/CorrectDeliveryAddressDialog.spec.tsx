import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CustomerDeliveryAddress,
  CustomerDeliveryAddressUpdate,
} from '@warehouser/contracts/customers';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { CorrectDeliveryAddressDialog } from 'modules/customer/components/customer-directory/components/addresses/CorrectDeliveryAddressDialog';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// delivery-addresses R8 — AC-16/AC-17, "the correction submitted and shown".
// Never opened by any prior spec.
//
// Every field this suite submits is retyped rather than left at its pre-filled
// default, matching `CorrectItemDialog.spec.tsx`'s own `retype` helper.
//
// R20: the pre-fill itself is now pinned below. HeroUI's `TextField` owns the
// input's value, so RHF's `defaultValues` alone never reach the DOM —
// `register()`'s imperative ref write is discarded on render. This is fixable
// by the dialog's own wiring, and every other correction dialog in the repo
// already does it (`CorrectItemDialog.tsx`:144): pass `defaultValue` alongside
// `register()`. This dialog did not, and opened blank.

const hafen: CustomerDeliveryAddress = {
  id: '00000000-0000-4000-8000-000000000301',
  customerId: '00000000-0000-4000-8000-000000000201',
  addressText: 'Hafenstraße 14, 20457 Hamburg',
  accessNotes: 'Gate code 4711',
  isMain: true,
  deactivatedAt: null,
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
    .fn<(input: CustomerDeliveryAddressUpdate) => Promise<MutationResult>>()
    .mockResolvedValue(result);
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <CorrectDeliveryAddressDialog address={hafen} onSave={onSave} />
    </DialogHost>,
  );
  return { onClose, onSave };
};

const openedDialog = (): HTMLElement =>
  screen.getByRole('dialog', { name: 'Correct this delivery address' });

describe('CorrectDeliveryAddressDialog', () => {
  it('opens with the current address and access notes pre-filled', () => {
    renderDialog();

    const dialog = openedDialog();
    expect(within(dialog).getByLabelText('Delivery address')).toHaveValue(
      'Hafenstraße 14, 20457 Hamburg',
    );
    expect(within(dialog).getByLabelText(/access notes/iu)).toHaveValue(
      'Gate code 4711',
    );
  });

  it('submits the correction and closes (AC-16/AC-17)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = openedDialog();
    const addressField = within(dialog).getByLabelText('Delivery address');
    await user.clear(addressField);
    await user.type(addressField, 'Hafenstraße 14a, 20457 Hamburg');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save address' }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        addressText: 'Hafenstraße 14a, 20457 Hamburg',
        accessNotes: 'Gate code 4711',
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('clearing the access notes field submits null, which clears them', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = openedDialog();
    // The address is retyped to its own current text: required still has to
    // pass, and this proves the correction leaves an untouched address alone.
    const addressField = within(dialog).getByLabelText('Delivery address');
    await user.clear(addressField);
    await user.type(addressField, hafen.addressText);
    await user.clear(within(dialog).getByLabelText(/access notes/iu));
    await user.click(
      within(dialog).getByRole('button', { name: 'Save address' }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        addressText: hafen.addressText,
        accessNotes: null,
      }),
    );
  });

  it('blocks a blank address: no request is made and the field says so', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = openedDialog();
    await user.clear(within(dialog).getByLabelText('Delivery address'));
    await user.click(
      within(dialog).getByRole('button', { name: 'Save address' }),
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
    const { onClose } = renderDialog({
      error: {
        code: ErrorCode.CUSTOMERS_INVALID_INPUT,
        fieldErrors: { addressText: 'trimmed_non_empty' },
      },
    });

    const dialog = openedDialog();
    const addressField = within(dialog).getByLabelText('Delivery address');
    await user.clear(addressField);
    await user.type(addressField, '   ');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save address' }),
    );

    expect(
      await within(dialog).findByText(
        'Enter the address the goods are sent to.',
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
