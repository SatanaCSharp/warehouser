import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AdjustOnHandDialog } from 'modules/item/components/item-directory/components/AdjustOnHandDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { Item, OnHandAdjustmentCreate } from '@warehouser/contracts/items';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// T18 — sets an Item's On-hand Quantity with a stated reason (AC-08). DoD:
// "a test proves the adjustment dialog does not duplicate server validation
// rules client-side" and "each dialog handles server denial independently
// and its failure copy states that nothing changed" (AC-09a). Colocated with
// the dialog it covers (`placing-web-tests.md` §1).

const DIALOG_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'AdjustOnHandDialog.tsx',
);

const item: Item = {
  id: '00000000-0000-4000-8000-000000000230',
  sku: 'SKU-800',
  description: 'Counted crate',
  unitOfMeasure: 'each',
  onHandQuantity: 12,
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
    .fn<(input: OnHandAdjustmentCreate) => Promise<MutationResult>>()
    .mockResolvedValue({ data: item });
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <AdjustOnHandDialog item={item} onSave={onSave} />
    </DialogHost>,
  );
  return { onClose, onSave };
};

describe('AdjustOnHandDialog', () => {
  it('records the counted quantity with its stated reason (AC-08)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', {
      name: /adjust on-hand quantity/iu,
    });
    const quantityField = within(dialog).getByLabelText(/quantity/iu);
    await user.clear(quantityField);
    await user.type(quantityField, '25');
    await user.type(within(dialog).getByLabelText(/reason/iu), 'Cycle count');
    await user.click(
      within(dialog).getByRole('button', { name: /save quantity/iu }),
    );

    expect(onSave).toHaveBeenCalledWith({
      countedQuantity: 25,
      reason: 'Cycle count',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('blocks an adjustment left without a reason and tells the member every change is recorded with one (AC-09a)', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', {
      name: /adjust on-hand quantity/iu,
    });
    const quantityField = within(dialog).getByLabelText(/quantity/iu);
    await user.clear(quantityField);
    await user.type(quantityField, '25');
    await user.click(
      within(dialog).getByRole('button', { name: /save quantity/iu }),
    );

    expect(
      await within(dialog).findByText(/every change to on-hand quantity/iu),
    ).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('stays open on a server denial and states that nothing has changed', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: OnHandAdjustmentCreate) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: { code: 'items.adjustment_reason_required', fieldErrors: {} },
      });
    renderWithProviders(
      <DialogHost onClose={vi.fn()}>
        <AdjustOnHandDialog item={item} onSave={onSave} />
      </DialogHost>,
    );

    const dialog = screen.getByRole('dialog', {
      name: /adjust on-hand quantity/iu,
    });
    const quantityField = within(dialog).getByLabelText(/quantity/iu);
    await user.clear(quantityField);
    await user.type(quantityField, '25');
    await user.type(within(dialog).getByLabelText(/reason/iu), 'Cycle count');
    await user.click(
      within(dialog).getByRole('button', { name: /save quantity/iu }),
    );

    expect(
      await within(dialog).findByText(/nothing has changed/iu),
    ).toBeVisible();
    expect(dialog).toBeInTheDocument();
  });

  it('does not duplicate the server’s On-hand Quantity range/whole-number rule client-side (AC-09, sad.md)', () => {
    // web-dialogs.md §3 / design-handoff.md `HeroUI/Field` row: "Do not
    // duplicate server validation rules client-side." A Zod (or hand-rolled)
    // negative/non-integer pre-check on `countedQuantity` is exactly that
    // duplication, so its absence from the dialog's own source is asserted
    // directly rather than only through behavior, which a lenient
    // implementation could still pass by accident.
    const source = readFileSync(DIALOG_SOURCE, 'utf8');

    expect(source).not.toMatch(/\.int\(\)|\.nonnegative\(\)|\.positive\(\)/u);
    expect(source).not.toMatch(/parseWithSchema|z\.object|z\.strictObject/u);
  });
});
