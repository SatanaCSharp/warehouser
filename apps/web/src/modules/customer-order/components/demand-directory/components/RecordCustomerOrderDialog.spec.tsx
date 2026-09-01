import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { RecordCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/RecordCustomerOrderDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { CustomerOrderCreate } from '@warehouser/contracts/customer-orders';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// AC-01 / AC-02 / AC-02a and BRIEF §A. What this suite pins is that a refusal
// names the value it will not accept **on the field it is about**:
//
//  - a Zod rejection arrives already keyed by field (`quantity: tooSmall`),
//    because the server lifts `details.fields` and `api-client.ts` normalizes
//    it into `fieldErrors`;
//  - AC-02a's "that date has already passed" is a *domain* refusal decided
//    against the server's clock, so it names no Zod field and is bound to
//    `neededBy` by the endpoint's `transformErrorResponse`;
//  - a refusal that names no field at all still has to say something.
//
// The dialog is rendered with no Item fixture: the picker's own contents are
// `ItemPicker`'s to prove, and none of the above depends on them.

const renderDialog = (
  result: MutationResult,
): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: CustomerOrderCreate) => Promise<MutationResult>>()
    .mockResolvedValue(result);
  // The dialog reads the Item picker's collection, which is Warehouse-scoped,
  // so it needs an entered-Warehouse match rather than a bare store.
  renderInEnteredWarehouse(
    <DialogHost onClose={onClose}>
      <RecordCustomerOrderDialog
        presetItemId="00000000-0000-4000-8000-000000000101"
        onSave={onSave}
      />
    </DialogHost>,
    authenticatedStore(),
    accessIds.warehouse,
  );
  return { onClose, onSave };
};

/**
 * The calendar cell for the current day. HeroUI's popover stays `aria-hidden`
 * while it is entering and jsdom never resolves that transition, so the open
 * calendar is only reachable with `{ hidden: true }` — the same reason
 * `test/hero-select.ts` gives. Today is picked rather than a fixed date so the
 * suite does not expire.
 */
const todayCell = (): Promise<HTMLElement> =>
  screen.findByRole('button', { hidden: true, name: /today/iu });

/** Fills the two free-text fields and submits; the Item is preset. */
const submitWith = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  quantity: string,
): Promise<void> => {
  await user.type(
    within(dialog).getByLabelText(/customer/iu),
    'Nordwind Logistik GmbH',
  );
  const quantityField = within(dialog).getByLabelText(/quantity/iu);
  await user.clear(quantityField);
  await user.type(quantityField, quantity);
  await user.click(
    within(dialog).getByRole('button', { name: /record demand/iu }),
  );
};

describe('RecordCustomerOrderDialog', () => {
  it('names what it records and carries helper text on every field', async () => {
    renderDialog({ data: {} });

    const dialog = await screen.findByRole('dialog', {
      name: 'Record what a customer is waiting for',
    });
    expect(
      within(dialog).getByText(
        'The end customer waiting for the goods. A name is all this release records.',
      ),
    ).toBeInTheDocument();
    // F12 — the Item helper is the field's own description, not a paragraph
    // that merely sits under it: `toHaveAccessibleDescription` resolves it the
    // way an assistive technology does, so a sentence rendered beside the
    // control rather than attached to it fails here.
    expect(
      within(dialog).getByRole('button', { name: /item/iu }),
    ).toHaveAccessibleDescription(
      'Only active items of this warehouse are offered.',
    );
    expect(
      within(dialog).getByText('A date that has not already passed.'),
    ).toBeInTheDocument();
  });

  it('never submits an empty needed-by date: no request is made and the field says why', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({ data: {} });

    const dialog = await screen.findByRole('dialog');
    await submitWith(user, dialog, '800');

    expect(
      await within(dialog).findByText(
        'Enter the date the customer needs the goods by.',
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  // AC-02 — the server's Zod refusal names its own field, so the message lands
  // under that field rather than as one sentence about the whole form.
  it('marks the quantity field with the rule the server refused it on (AC-02)', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({
      error: { code: 'request.invalid', fieldErrors: { quantity: 'tooSmall' } },
    });

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/customer/iu),
      'Nordwind Logistik GmbH',
    );
    const quantityField = within(dialog).getByLabelText(/quantity/iu);
    await user.clear(quantityField);
    await user.type(quantityField, '0');
    await user.click(
      within(dialog).getByRole('button', { name: /open calendar/iu }),
    );
    await user.click(await todayCell());
    await user.click(
      within(dialog).getByRole('button', { name: /record demand/iu }),
    );

    expect(
      await within(dialog).findByText('A whole number greater than zero.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // AC-02a — a domain refusal, not a Zod one. It reaches the field only because
  // the endpoint binds it, which is what `fieldErrorsForCode` exists for.
  it('marks the needed-by field when the server refuses a date that has passed (AC-02a)', async () => {
    const user = userEvent.setup();
    renderDialog({
      error: {
        code: ErrorCode.CUSTOMER_ORDERS_NEEDED_BY_IN_PAST,
        fieldErrors: { neededBy: 'inPast' },
      },
    });

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/customer/iu),
      'Nordwind Logistik GmbH',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /open calendar/iu }),
    );
    await user.click(await todayCell());
    await user.click(
      within(dialog).getByRole('button', { name: /record demand/iu }),
    );

    expect(
      // The helper text under the field says the same rule in the abstract, so
      // the refusal is identified by the half only it carries.
      await within(dialog).findByText(/behind this warehouse's own clock/iu),
    ).toBeInTheDocument();
  });

  it('closes only once the order has actually been recorded (AC-01)', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ data: {} });

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/customer/iu),
      'Nordwind Logistik GmbH',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /open calendar/iu }),
    );
    await user.click(await todayCell());
    await user.click(
      within(dialog).getByRole('button', { name: /record demand/iu }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
