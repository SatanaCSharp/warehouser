import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CorrectItemDialog } from 'modules/item/components/item-directory/components/CorrectItemDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { Item, ItemUpdate } from '@warehouser/contracts/items';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// T18 — corrects an Item's description or unit of measure independently
// (AC-06b). DoD: "each dialog handles server denial independently and its
// failure copy states that nothing changed" (AC-06c's refusal reaching this
// dialog). Colocated with the dialog it covers (`placing-web-tests.md` §1).

const item: Item = {
  id: '00000000-0000-4000-8000-000000000210',
  sku: 'SKU-500',
  description: 'Original description',
  unitOfMeasure: 'each',
  onHandQuantity: 5,
  deactivatedAt: null,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
};

const renderDialog = (): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: ItemUpdate) => Promise<MutationResult>>()
    .mockResolvedValue({ data: item });
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <CorrectItemDialog item={item} onSave={onSave} />
    </DialogHost>,
  );
  return { onClose, onSave };
};

describe('CorrectItemDialog', () => {
  it('corrects the description alone, leaving the unit of measure untouched (AC-06b)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', { name: /correct item/iu });
    const descriptionField = within(dialog).getByLabelText(/description/iu);
    await user.clear(descriptionField);
    await user.type(descriptionField, 'Corrected description');
    await user.click(
      within(dialog).getByRole('button', { name: /save changes/iu }),
    );

    expect(onSave).toHaveBeenCalledWith({
      description: 'Corrected description',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('corrects the unit of measure alone, leaving the description untouched (AC-06b)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', { name: /correct item/iu });
    const unitField = within(dialog).getByLabelText(/unit/iu);
    await user.clear(unitField);
    await user.type(unitField, 'case');
    await user.click(
      within(dialog).getByRole('button', { name: /save changes/iu }),
    );

    expect(onSave).toHaveBeenCalledWith({ unitOfMeasure: 'case' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open on a SKU-fixed style refusal and states that nothing has changed (AC-06c)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: ItemUpdate) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: { code: 'items.sku_fixed', fieldErrors: {} },
      });
    renderWithProviders(
      <DialogHost onClose={vi.fn()}>
        <CorrectItemDialog item={item} onSave={onSave} />
      </DialogHost>,
    );

    const dialog = screen.getByRole('dialog', { name: /correct item/iu });
    const descriptionField = within(dialog).getByLabelText(/description/iu);
    await user.clear(descriptionField);
    await user.type(descriptionField, 'Corrected description');
    await user.click(
      within(dialog).getByRole('button', { name: /save changes/iu }),
    );

    expect(
      await within(dialog).findByText(/nothing has changed/iu),
    ).toBeVisible();
    expect(dialog).toBeInTheDocument();
  });
});
