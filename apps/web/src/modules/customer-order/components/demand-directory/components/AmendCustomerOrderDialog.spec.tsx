import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@warehouser/shared-types/enums';
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
//
// It also covers BRIEF §A on this dialog: a refusal must name the value it
// will not accept. AC-19b's floor arrives bound to the quantity field by the
// endpoint's `transformErrorResponse`, and the schema's cross-field `refine`
// arrives as `request.invalid` with **no** `fieldErrors` at all — the one
// refusal here that has no field to mark.

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

const renderDialog = (
  result: MutationResult = { data: order },
): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: CustomerOrderAmend) => Promise<MutationResult>>()
    .mockResolvedValue(result);
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

  // AC-19b — the refusal names the value it will not accept, on the field it is
  // about, rather than one sentence saying nothing changed. The code names no
  // field itself, so the endpoint binds it (`api/customer-order-api.ts`).
  it('marks the quantity field with the reason it cannot go lower, and stays open (AC-19b)', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({
      error: {
        code: ErrorCode.CUSTOMER_ORDERS_QUANTITY_BELOW_ALLOCATED,
        fieldErrors: { quantity: 'belowAllocated' },
      },
    });

    const dialog = screen.getByRole('dialog', { name: /amend/iu });
    const quantityField = within(dialog).getByLabelText(/quantity/iu);
    await user.clear(quantityField);
    await user.type(quantityField, '10');
    await user.click(
      within(dialog).getByRole('button', { name: /save changes/iu }),
    );

    expect(
      await within(dialog).findByText(
        /cannot go below what has already been/iu,
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // AC-19b asks the system to name the value it will not accept. The rule alone
  // ("cannot go below what has already been assigned") leaves the member to
  // guess the number; the server publishes it as `details.allocatedQuantity`,
  // and it is group-separated like every other quantity on the surface.
  it('names the allocated figure the quantity cannot go below (AC-19b)', async () => {
    const user = userEvent.setup();
    renderDialog({
      error: {
        code: ErrorCode.CUSTOMER_ORDERS_QUANTITY_BELOW_ALLOCATED,
        fieldErrors: { quantity: 'belowAllocated' },
        details: { allocatedQuantity: 1600, submittedQuantity: 10 },
      },
    });

    const dialog = screen.getByRole('dialog', { name: /amend/iu });
    const quantityField = within(dialog).getByLabelText(/quantity/iu);
    await user.clear(quantityField);
    await user.type(quantityField, '10');
    await user.click(
      within(dialog).getByRole('button', { name: /save changes/iu }),
    );

    expect(
      // `.` spans the group separator deliberately: the separator is the
      // formatter's business, and this test's subject is that the *figure*
      // arrives at all.
      await within(dialog).findByText(/cannot go below 1.600\./iu),
    ).toBeInTheDocument();
  });

  // BRIEF §A — `details.fields` is absent, not empty, when no issue names a
  // field: the amend schema's "at least one field must be present" carries an
  // empty issue path, so this refusal has to be explained at form level.
  it('explains a refusal that names no field at all, rather than showing nothing', async () => {
    const user = userEvent.setup();
    renderDialog({ error: { code: 'request.invalid' } });

    const dialog = screen.getByRole('dialog', { name: /amend/iu });
    await user.click(
      within(dialog).getByRole('button', { name: /save changes/iu }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Nothing was changed. Change the quantity or the needed-by date before saving.',
    );
  });

  // The amendment leaves every frozen draft exactly as it is; what moves is the
  // Drift Signal comparing it against the demand as it now stands (AC-16).
  it('states what an amendment does to a frozen draft linked to this order', () => {
    renderDialog();

    expect(
      screen.getByText(
        'A frozen draft linked to this order will report a drift signal',
      ),
    ).toBeInTheDocument();
  });
});
