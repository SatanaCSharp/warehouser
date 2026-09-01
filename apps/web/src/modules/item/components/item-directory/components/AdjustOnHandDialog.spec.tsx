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

// T18 — sets an Item's On-hand Quantity with a stated reason (AC-08, frames
// `s5EPi` / `blZtz` "Set the on-hand quantity"). DoD: the dialog names its
// subject, carries a helper under every field and the "nothing else changes
// this figure" note, does not duplicate the server's range rule client-side
// (AC-09), and states a refusal ON the field it belongs to rather than as
// "nothing has changed" (AC-09, AC-09a). Colocated with the dialog it covers
// (`placing-web-tests.md` §1).

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
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 0,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
};

const renderDialog = (
  onSave: (input: OnHandAdjustmentCreate) => Promise<MutationResult> = vi
    .fn<(input: OnHandAdjustmentCreate) => Promise<MutationResult>>()
    .mockResolvedValue({ data: item }),
): { onClose: ReturnType<typeof vi.fn> } => {
  const onClose = vi.fn();
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <AdjustOnHandDialog item={item} onSave={onSave} />
    </DialogHost>,
  );
  return { onClose };
};

const dialog = (): HTMLElement =>
  screen.getByRole('dialog', { name: /set the on-hand quantity/iu });

const fill = async (
  user: ReturnType<typeof userEvent.setup>,
  { reason }: { reason?: string } = {},
): Promise<void> => {
  const quantityField = within(dialog()).getByLabelText(/counted quantity/iu);
  await user.clear(quantityField);
  await user.type(quantityField, '25');
  if (reason !== undefined) {
    await user.type(within(dialog()).getByLabelText(/reason/iu), reason);
  }
  await user.click(
    within(dialog()).getByRole('button', { name: /save the count/iu }),
  );
};

describe('AdjustOnHandDialog', () => {
  it('records the counted quantity with its stated reason (AC-08)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: OnHandAdjustmentCreate) => Promise<MutationResult>>()
      .mockResolvedValue({ data: item });
    const { onClose } = renderDialog(onSave);

    await fill(user, { reason: 'Cycle count' });

    expect(onSave).toHaveBeenCalledWith({
      countedQuantity: 25,
      reason: 'Cycle count',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('names the Item it is about, and carries the helpers and the note the frame draws', () => {
    renderDialog();
    const open = dialog();

    expect(within(open).getByLabelText(/^item$/iu)).toHaveValue(
      'SKU-800 · Counted crate',
    );
    expect(open).toHaveTextContent(/a whole number that is never negative/iu);
    expect(open).toHaveTextContent(
      /required\. Recorded with your name and the time, so a figure that drifts can be explained/iu,
    );
    expect(open).toHaveTextContent(
      /nothing else in Warehouser changes this figure — confirming an arrival does not touch it/iu,
    );
  });

  it('blocks an adjustment left without a reason and tells the member every change is recorded with one (AC-09a)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: OnHandAdjustmentCreate) => Promise<MutationResult>>()
      .mockResolvedValue({ data: item });
    renderDialog(onSave);

    await fill(user);

    expect(
      await within(dialog()).findByText(/every change to on-hand quantity/iu),
    ).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('states a refused count on the count field, naming the rule it broke (AC-09)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: OnHandAdjustmentCreate) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: {
          code: 'items.invalid_on_hand_quantity',
          fieldErrors: { countedQuantity: 'nonNegativeInteger' },
        },
      });
    renderDialog(onSave);

    await fill(user, { reason: 'Cycle count' });

    expect(
      await within(dialog()).findByText(
        /on-hand quantity is a whole number that is never negative/iu,
      ),
    ).toBeVisible();
    expect(dialog()).toBeInTheDocument();
  });

  it('states a refusal no field names, rather than only "nothing has changed" (BRIEF §A)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: OnHandAdjustmentCreate) => Promise<MutationResult>>()
      .mockResolvedValue({ error: { code: 'items.target_unavailable' } });
    renderDialog(onSave);

    await fill(user, { reason: 'Cycle count' });

    expect(
      await within(dialog()).findByText(
        /this item is no longer available in this warehouse/iu,
      ),
    ).toBeVisible();
    expect(dialog()).toBeInTheDocument();
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
