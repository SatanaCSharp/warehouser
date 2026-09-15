import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CustomerOrder,
  CustomerOrderCancellation,
} from '@warehouser/contracts/customer-orders';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { CancelCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/CancelCustomerOrderDialog';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { DialogHost } from 'shared/components/DialogHost';
import { accessIds } from 'test/access-fixtures';
import { renderWithProviders } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// AC-19a and BRIEF §A. Every refusal this dialog can receive names the reason
// field: an empty reason arrives as the Zod code `tooSmall` the server lifted
// into `details.fields`, and an order that has already left the Unfulfilled
// state arrives as `customer_orders.invalid_state`, which the endpoint binds to
// the same field. Neither may present as "Nothing has changed."
// Colocated with the dialog it covers (`placing-web-tests.md` §1).

const order: CustomerOrder = {
  id: '00000000-0000-4000-8000-000000000301',
  itemId: '00000000-0000-4000-8000-000000000101',
  customerName: 'Baltic Freight OÜ',
  quantity: 600,
  outstandingQuantity: 440,
  neededBy: '2026-09-09',
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
    .fn<(input: CustomerOrderCancellation) => Promise<MutationResult>>()
    .mockResolvedValue(result);
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <CancelCustomerOrderDialog order={order} onSave={onSave} />
    </DialogHost>,
  );
  return { onClose, onSave };
};

describe('CancelCustomerOrderDialog', () => {
  // The dialog names its subject (design frame `s5EPi`:
  // `Cancel Baltic Freight OÜ's order?`), and says what cancelling does to a
  // frozen draft that links to it: nothing.
  it('names the customer it is about and what a frozen draft keeps', () => {
    renderDialog();

    expect(
      screen.getByRole('dialog', { name: "Cancel Baltic Freight OÜ's order?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/keeps every value it was frozen with/iu),
    ).toBeInTheDocument();
  });

  it('records the cancellation reason and closes on success (AC-19a)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/reason/iu),
      'Customer withdrew the order on 24 Aug',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /cancel the order/iu }),
    );

    expect(onSave).toHaveBeenCalledWith({
      cancellationReason: 'Customer withdrew the order on 24 Aug',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('never cancels without a reason: no request is made and the field says why', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = screen.getByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: /cancel the order/iu }),
    );

    expect(
      await within(dialog).findByText(
        'State why this order is being cancelled.',
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('marks the reason field when the order has already left the Unfulfilled state', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({
      error: {
        code: ErrorCode.CUSTOMER_ORDERS_INVALID_STATE,
        fieldErrors: { cancellationReason: 'invalidState' },
      },
    });

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/reason/iu), 'Too late');
    await user.click(
      within(dialog).getByRole('button', { name: /cancel the order/iu }),
    );

    expect(
      await within(dialog).findByText(
        'This order has already been fulfilled or cancelled, so it cannot be cancelled again.',
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('places the non-destructive control before the destructive primary in DOM and keyboard order', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    const controls = within(dialog).getAllByRole('button', {
      name: /keep the order|cancel the order/iu,
    });
    expect(controls[0]).toHaveTextContent('Keep the order');
    expect(controls[1]).toHaveTextContent('Cancel the order');
  });
});
