import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateItemDialog } from 'modules/item/components/item-directory/components/CreateItemDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { Item, ItemCreate } from '@warehouser/contracts/items';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// T18 — creates an Item (AC-06, frame `s5EPi` "Add an item"). DoD: the dialog
// carries its lede, a helper under every field and the "starts active with
// nothing on hand" note, and a refused SKU (AC-07) is stated ON the SKU field,
// naming the value and the rule — not as "nothing has changed". Colocated with
// the dialog it covers (`placing-web-tests.md` §1).

const existingItem: Item = {
  id: '00000000-0000-4000-8000-000000000250',
  sku: 'SKU-900',
  description: 'Pallet wrap, 500mm',
  unitOfMeasure: 'each',
  onHandQuantity: 60,
  deactivatedAt: null,
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 0,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
};

const renderDialog = (
  onSave: (input: ItemCreate) => Promise<MutationResult> = vi
    .fn<(input: ItemCreate) => Promise<MutationResult>>()
    .mockResolvedValue({ data: {} }),
  items: Item[] = [existingItem],
): { onClose: ReturnType<typeof vi.fn> } => {
  const onClose = vi.fn();
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <CreateItemDialog items={items} onSave={onSave} />
    </DialogHost>,
  );
  return { onClose };
};

const dialog = (): HTMLElement =>
  screen.getByRole('dialog', { name: /add an item/iu });

const fillAndSubmit = async (
  user: ReturnType<typeof userEvent.setup>,
  sku = 'SKU-901',
): Promise<void> => {
  const open = dialog();
  await user.type(within(open).getByLabelText(/sku/iu), sku);
  await user.type(within(open).getByLabelText(/description/iu), 'New crate');
  await user.type(within(open).getByLabelText(/counted in/iu), 'each');
  await user.click(within(open).getByRole('button', { name: /add item/iu }));
};

describe('CreateItemDialog', () => {
  it('creates an Item and closes on success (AC-06)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: ItemCreate) => Promise<MutationResult>>()
      .mockResolvedValue({ data: {} });
    const { onClose } = renderDialog(onSave);

    await fillAndSubmit(user);

    expect(onSave).toHaveBeenCalledWith({
      sku: 'SKU-901',
      description: 'New crate',
      unitOfMeasure: 'each',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('carries the lede, the per-field helpers and the note the frame draws', () => {
    renderDialog();
    const open = dialog();

    expect(open).toHaveTextContent(
      /the same SKU in another warehouse names an unrelated item/iu,
    );
    expect(open).toHaveTextContent(
      /what the good is, in the words your team uses/iu,
    );
    expect(open).toHaveTextContent(/pieces, metres, kilograms or litres/iu);
    expect(open).toHaveTextContent(
      /a new item starts active with nothing on hand/iu,
    );
  });

  it('names the value and the rule on the SKU field when the SKU is already taken (AC-07)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: ItemCreate) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: { code: 'items.sku_taken', fieldErrors: { sku: 'skuTaken' } },
      });
    renderDialog(onSave);

    await fillAndSubmit(user, 'SKU-900');

    // The whole point of the field-error plumbing: the refusal names the SKU
    // it will not accept and the Item that already holds it, rather than
    // saying that nothing changed.
    expect(
      await within(dialog()).findByText(
        /SKU-900 already names “Pallet wrap, 500mm” in this warehouse\. A SKU identifies at most one item here\./u,
      ),
    ).toBeVisible();
    expect(dialog()).toBeInTheDocument();
  });

  it('still names the refused SKU when the catalogue read does not hold the Item that took it', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: ItemCreate) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: { code: 'items.sku_taken', fieldErrors: { sku: 'skuTaken' } },
      });
    renderDialog(onSave, []);

    await fillAndSubmit(user, 'SKU-900');

    expect(
      await within(dialog()).findByText(
        /SKU-900 already names another item in this warehouse/u,
      ),
    ).toBeVisible();
  });

  it('explains a refusal no field names, rather than leaving the member with nothing (BRIEF §A)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: ItemCreate) => Promise<MutationResult>>()
      .mockResolvedValue({ error: { code: 'request.invalid' } });
    renderDialog(onSave);

    await fillAndSubmit(user);

    expect(
      await within(dialog()).findByText(
        /some of what you entered was not accepted, and nothing has changed/iu,
      ),
    ).toBeVisible();
  });
});
