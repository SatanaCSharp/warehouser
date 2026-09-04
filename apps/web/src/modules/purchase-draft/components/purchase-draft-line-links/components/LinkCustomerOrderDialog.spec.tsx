import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { LinkCustomerOrderDialog } from 'modules/purchase-draft/components/purchase-draft-line-links/components/LinkCustomerOrderDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { UserEvent } from '@testing-library/user-event';
import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import type { PurchaseDraftLineLinkCreate } from '@warehouser/contracts/purchase-drafts';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// AC-10 / AC-10a / AC-11a — linking a draft line to the demand it is intended
// to serve. This is the destination's core loop: without it a draft can never
// say who each line is for, so the frozen view, the Drift Signal and the
// arrival's assignment section all have nothing to work from.

const customerOrders: CustomerOrder[] = [
  {
    id: '00000000-0000-4000-8000-000000000401',
    itemId: '00000000-0000-4000-8000-000000000101',
    customer: null,
    customerName: 'Nordwind Logistik GmbH',
    quantity: 800,
    outstandingQuantity: 800,
    neededBy: '2026-09-02',
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId: '00000000-0000-4000-8000-000000000003',
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
  },
];

// AC-15 — a Customer Order going to a Delivery Address other than the one this
// line ships to, so the refusal has a real order address to name.
const elsewhereOrder: CustomerOrder = {
  id: '00000000-0000-4000-8000-000000000402',
  itemId: '00000000-0000-4000-8000-000000000101',
  customer: {
    id: '00000000-0000-4000-8000-000000000201',
    name: 'Baltic Freight OU',
  },
  customerName: null,
  destination: {
    deliveryAddressId: '00000000-0000-4000-8000-000000000302',
    addressText: 'Sadama tee 2, 10111 Tallinn',
    accessNotes: null,
    isMain: true,
    deactivatedAt: null,
  },
  quantity: 200,
  outstandingQuantity: 200,
  neededBy: '2026-09-05',
  state: 'unfulfilled',
  cancellationReason: null,
  recordedByUserId: '00000000-0000-4000-8000-000000000003',
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
};

const openDialog = (
  onSave: (input: PurchaseDraftLineLinkCreate) => Promise<MutationResult>,
  orders: CustomerOrder[] = customerOrders,
  onClose = vi.fn(),
  lineDeliveryAddressText: string | null = null,
): void => {
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <LinkCustomerOrderDialog
        customerOrders={orders}
        index={1}
        lineDeliveryAddressText={lineDeliveryAddressText}
        unitOfMeasure="pieces"
        onSave={onSave}
      />
    </DialogHost>,
  );
};

const linkDialog = (): HTMLElement =>
  screen.getByRole('dialog', { name: /link a customer order to line 1/iu });

/**
 * HeroUI v3's `Select` mounts its `ListBox` only once the popover opens and
 * keeps it `aria-hidden` while entering, which jsdom never resolves — hence
 * `{ hidden: true }`, exactly as `test/hero-select.ts` explains. The option is
 * matched on the customer's name rather than on the picker's whole option
 * label, because how `modules/customer-order` composes that label is its own
 * decision and not what this dialog is under test for.
 */
const pickCustomerOrder = async (
  user: UserEvent,
  dialog: HTMLElement,
  customerName: string,
): Promise<void> => {
  await user.click(
    within(dialog).getByRole('button', { name: /customer order/iu }),
  );
  const option = screen
    .getAllByRole('option', { hidden: true })
    .find(
      (candidate) =>
        candidate.tagName !== 'OPTION' &&
        candidate.textContent?.includes(customerName),
    );
  if (!option) {
    throw new Error(`No open option for "${customerName}"`);
  }
  await user.click(option);
};

describe('LinkCustomerOrderDialog', () => {
  it('records the customer order and the quantity intended for it, then closes (AC-10)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi
      .fn<(input: PurchaseDraftLineLinkCreate) => Promise<MutationResult>>()
      .mockResolvedValue({ data: {} });
    openDialog(onSave, customerOrders, onClose);

    const dialog = linkDialog();
    await pickCustomerOrder(user, dialog, 'Nordwind Logistik GmbH');
    const quantity = within(dialog).getByLabelText('Intended for them');
    await user.clear(quantity);
    await user.type(quantity, '800');
    await user.click(
      within(dialog).getByRole('button', { name: 'Link the order' }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        customerOrderId: '00000000-0000-4000-8000-000000000401',
        statedQuantity: 800,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // BRIEF §A — a refusal names the value it will not accept, on the field it
  // belongs to, rather than reading "nothing has changed".
  it('marks the customer-order field when the server refuses an order it already links to', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: PurchaseDraftLineLinkCreate) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: {
          code: ErrorCode.PURCHASE_DRAFTS_LINK_EXISTS,
          fieldErrors: { customerOrderId: 'exists' },
        },
      });
    openDialog(onSave);

    const dialog = linkDialog();
    await pickCustomerOrder(user, dialog, 'Nordwind Logistik GmbH');
    await user.type(within(dialog).getByLabelText('Intended for them'), '800');
    await user.click(
      within(dialog).getByRole('button', { name: 'Link the order' }),
    );

    expect(
      await within(dialog).findByText(
        'This line is already linked to that customer order. Change the quantity on the existing link instead.',
      ),
    ).toBeVisible();
    expect(dialog).toBeInTheDocument();
  });

  // BRIEF §A note 2 — `request.invalid` can arrive with no `details.fields` at
  // all (a cross-field `refine`, an unrecognized key), and so can a code
  // outside this dialog's own three-entry table. Both used to leave the dialog
  // open and silent, with only a generic toast behind it.
  it.each([
    {
      code: 'request.invalid',
      message: /some of what you entered was not accepted/iu,
    },
    {
      code: ErrorCode.PURCHASE_DRAFTS_CONCURRENT_CHANGE,
      message: /could not be saved, and nothing has changed/iu,
    },
  ])('explains a refusal no field names ($code)', async ({ code, message }) => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: PurchaseDraftLineLinkCreate) => Promise<MutationResult>>()
      .mockResolvedValue({ error: { code } });
    openDialog(onSave);

    const dialog = linkDialog();
    await pickCustomerOrder(user, dialog, 'Nordwind Logistik GmbH');
    await user.type(within(dialog).getByLabelText('Intended for them'), '800');
    await user.click(
      within(dialog).getByRole('button', { name: 'Link the order' }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    expect(dialog).toBeInTheDocument();
  });

  it('refuses to submit, with the reason stated, when nothing is waiting for this item', () => {
    const onSave = vi
      .fn<(input: PurchaseDraftLineLinkCreate) => Promise<MutationResult>>()
      .mockResolvedValue({ data: {} });
    openDialog(onSave, []);

    const dialog = linkDialog();
    expect(
      within(dialog).getByRole('button', { name: 'Link the order' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByText(
        'No unfulfilled customer order names this item yet. Record the demand first, and it can then be linked here.',
      ),
    ).toBeVisible();
  });

  it('places cancel before the primary in DOM and keyboard order', () => {
    openDialog(
      vi
        .fn<(input: PurchaseDraftLineLinkCreate) => Promise<MutationResult>>()
        .mockResolvedValue({ data: {} }),
    );

    const labels = within(linkDialog())
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(labels.indexOf('Cancel')).toBeLessThan(
      labels.indexOf('Link the order'),
    );
  });

  // AC-15 — the link is refused because the order goes to a different
  // Delivery Address than this line ships to, and the refusal names the
  // address each of the two is bound for.
  it('names the address each of the two is bound for when the order goes elsewhere (AC-15)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: PurchaseDraftLineLinkCreate) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: {
          code: ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT,
          details: {
            lineDeliveryAddressId: '00000000-0000-4000-8000-000000000301',
            customerOrderDeliveryAddressId:
              '00000000-0000-4000-8000-000000000302',
          },
        },
      });
    openDialog(onSave, [elsewhereOrder], vi.fn(), 'Nordkai 8, 21079 Hamburg');

    const dialog = linkDialog();
    await pickCustomerOrder(user, dialog, 'Baltic Freight OU');
    await user.type(within(dialog).getByLabelText('Intended for them'), '200');
    await user.click(
      within(dialog).getByRole('button', { name: 'Link the order' }),
    );

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Nordkai 8, 21079 Hamburg');
    expect(alert).toHaveTextContent('Sadama tee 2, 10111 Tallinn');
    expect(dialog).toBeInTheDocument();
  });
});
