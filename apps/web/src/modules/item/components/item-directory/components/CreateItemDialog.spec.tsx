import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateItemDialog } from 'modules/item/components/item-directory/components/CreateItemDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { ItemCreate } from '@warehouser/contracts/items';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// T18 — creates an Item (AC-06). DoD: "each dialog handles server denial
// independently and its failure copy states that nothing changed" (AC-09a's
// sibling rule for every Item dialog). Colocated with the dialog it covers
// (`placing-web-tests.md` §1).

const renderDialog = (): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: ItemCreate) => Promise<MutationResult>>()
    .mockResolvedValue({ data: {} });
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <CreateItemDialog onSave={onSave} />
    </DialogHost>,
  );
  return { onClose, onSave };
};

const fillAndSubmit = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
): Promise<void> => {
  await user.type(within(dialog).getByLabelText(/sku/iu), 'SKU-900');
  await user.type(within(dialog).getByLabelText(/description/iu), 'New crate');
  await user.type(within(dialog).getByLabelText(/unit/iu), 'each');
  await user.click(within(dialog).getByRole('button', { name: /add item/iu }));
};

describe('CreateItemDialog', () => {
  it('creates an Item and closes on success (AC-06)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', { name: /add item/iu });
    await fillAndSubmit(user, dialog);

    expect(onSave).toHaveBeenCalledWith({
      sku: 'SKU-900',
      description: 'New crate',
      unitOfMeasure: 'each',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open on a refused SKU and states that nothing has changed (AC-07)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: ItemCreate) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: { code: 'items.sku_taken', fieldErrors: {} },
      });
    renderWithProviders(
      <DialogHost onClose={vi.fn()}>
        <CreateItemDialog onSave={onSave} />
      </DialogHost>,
    );

    const dialog = screen.getByRole('dialog', { name: /add item/iu });
    await fillAndSubmit(user, dialog);

    expect(
      await within(dialog).findByText(/nothing has changed/iu),
    ).toBeVisible();
    expect(dialog).toBeInTheDocument();
  });
});
