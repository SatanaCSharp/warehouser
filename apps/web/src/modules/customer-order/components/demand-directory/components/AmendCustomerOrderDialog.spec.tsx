import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AmendCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/AmendCustomerOrderDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { accessIds } from 'test/access-fixtures';
import { renderWithProviders } from 'test/render';

import type {
  CustomerOrder,
  CustomerOrderAmend,
} from '@warehouser/contracts/customer-orders';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// Covers the needed-by field now that it is a `FormDateField` rather than a
// native `<input type="date">`: the picker is a React Hook Form `Controller`
// field, so what this asserts is that the two halves of AC-19 still submit
// independently — a date picked in the calendar reaches `onSave`, and a
// quantity changed on its own leaves the pre-filled date out of the payload.

const order: CustomerOrder = {
  id: '00000000-0000-4000-8000-000000000301',
  itemId: '00000000-0000-4000-8000-000000000101',
  customerName: 'Nordwind Logistik',
  quantity: 1000,
  outstandingQuantity: 1000,
  neededBy: '2026-09-04',
  state: 'unfulfilled',
  cancellationReason: null,
  recordedByUserId: accessIds.actingUser,
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
};

const renderDialog = (): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: CustomerOrderAmend) => Promise<MutationResult>>()
    .mockResolvedValue({ data: order });
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <AmendCustomerOrderDialog order={order} onSave={onSave} />
    </DialogHost>,
  );
  return { onClose, onSave };
};

describe('AmendCustomerOrderDialog', () => {
  it('amends the needed-by date alone from the calendar, leaving the quantity untouched (AC-19)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', { name: /amend/iu });
    await user.click(
      within(dialog).getByRole('button', { name: /open calendar/iu }),
    );
    // HeroUI's popover stays `aria-hidden` while it is entering and jsdom never
    // resolves that transition, so the open calendar is only reachable with
    // `{ hidden: true }` — the same reason `test/hero-select.ts` gives.
    await user.click(
      await screen.findByRole('button', {
        name: /September 11, 2026/u,
        hidden: true,
      }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: /save changes/iu }),
    );

    expect(onSave).toHaveBeenCalledWith({ neededBy: '2026-09-11' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('amends the quantity alone, submitting no needed-by the picker only displayed (AC-19)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', { name: /amend/iu });
    const quantityField = within(dialog).getByLabelText(/quantity/iu);
    await user.clear(quantityField);
    await user.type(quantityField, '750');
    await user.click(
      within(dialog).getByRole('button', { name: /save changes/iu }),
    );

    expect(onSave).toHaveBeenCalledWith({ quantity: 750 });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
