import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { itemApi } from 'modules/item/api/item-api';
import { AddPurchaseDraftLineDialog } from 'modules/purchase-draft/components/AddPurchaseDraftLineDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { selectHeroOption } from 'test/hero-select';
import { renderInEnteredWarehouse } from 'test/render';

import type { Item } from '@warehouser/contracts/items';
import type { PurchaseDraftLineCreate } from '@warehouser/contracts/purchase-drafts';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// AC-10 — the dialog that says what a draft is ordering. It is also the one
// ordering dialog that passed no `onRefusal`: `FormModalDialog` applies field
// errors and then calls it, so a `request.invalid` carrying no `details.fields`
// (BRIEF §A note 2 says that is a real shape) left the dialog open, silent,
// with only a generic toast behind it. `ItemPicker` takes no `errorMessage`
// either, so a refusal bound to `itemId` had nowhere to render at all.

const item: Item = {
  id: '00000000-0000-4000-8000-000000000101',
  sku: 'WH-100420',
  description: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  onHandQuantity: 0,
  deactivatedAt: null,
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 0,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
};

const renderDialog = (
  onSave: (input: PurchaseDraftLineCreate) => Promise<MutationResult> = vi
    .fn<(input: PurchaseDraftLineCreate) => Promise<MutationResult>>()
    .mockResolvedValue({ data: {} }),
): { onClose: ReturnType<typeof vi.fn> } => {
  const onClose = vi.fn();
  const store = authenticatedStore();
  void store.dispatch(
    itemApi.util.upsertQueryData('listItems', accessIds.warehouse, [item]),
  );

  // The dialog's `ItemPicker` reads the catalogue of the entered Warehouse, so
  // it needs the Warehouse match `useEnteredWarehouse` resolves against.
  renderInEnteredWarehouse(
    <DialogHost onClose={onClose}>
      <AddPurchaseDraftLineDialog reference="PD-0143" onSave={onSave} />
    </DialogHost>,
    store,
  );

  return { onClose };
};

/**
 * The Warehouse match the dialog renders under resolves asynchronously, so the
 * dialog is awaited rather than read straight after `render`.
 */
const dialog = (): Promise<HTMLElement> =>
  screen.findByRole('dialog', { name: 'Add a line to PD-0143' });

const fillAndSubmit = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> => {
  const open = await dialog();
  await selectHeroOption(
    user,
    within(open).getByRole('button', { name: /item/iu }),
    'WH-100420 · Pallet wrap, 500mm',
  );
  const quantity = within(open).getByLabelText('Quantity');
  await user.clear(quantity);
  await user.type(quantity, '1200');
  await user.click(within(open).getByRole('button', { name: 'Add line' }));
};

describe('AddPurchaseDraftLineDialog', () => {
  // The dialogs board makes this non-negotiable: an act confirmed from a list
  // of look-alike drafts has to say which one it acts on (`s5EPi`).
  it('names the draft it adds to, and states the quantity rule', async () => {
    renderDialog();

    const open = await dialog();
    expect(
      within(open).getByText('A whole number greater than zero.'),
    ).toBeVisible();
  });

  it('states the item and the quantity, then closes on success (AC-10)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: PurchaseDraftLineCreate) => Promise<MutationResult>>()
      .mockResolvedValue({ data: {} });
    const { onClose } = renderDialog(onSave);

    await fillAndSubmit(user);

    expect(onSave).toHaveBeenCalledWith({
      itemId: item.id,
      orderedQuantity: 1200,
    });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // AC-11 — a deactivated Item and another Warehouse's arrive as the same code
  // deliberately, so the refusal does not disclose that the Item exists here.
  it('explains a refused item, which the picker itself cannot show', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: PurchaseDraftLineCreate) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: {
          code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
          fieldErrors: { itemId: 'unavailable' },
        },
      });
    renderDialog(onSave);

    await fillAndSubmit(user);

    const open = await dialog();
    expect(await within(open).findByRole('alert')).toHaveTextContent(
      'Only active items of this warehouse can be ordered on its drafts.',
    );
    expect(open).toBeInTheDocument();
  });

  it('explains a refusal no field names, rather than leaving the member with nothing (BRIEF §A)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: PurchaseDraftLineCreate) => Promise<MutationResult>>()
      .mockResolvedValue({ error: { code: 'request.invalid' } });
    renderDialog(onSave);

    await fillAndSubmit(user);

    const open = await dialog();
    expect(await within(open).findByRole('alert')).toHaveTextContent(
      /some of what you entered was not accepted, and nothing has changed/iu,
    );
    expect(open).toBeInTheDocument();
  });

  it('places cancel before the primary in DOM and keyboard order', async () => {
    renderDialog();

    const labels = within(await dialog())
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(labels.indexOf('Cancel')).toBeLessThan(labels.indexOf('Add line'));
  });
});
