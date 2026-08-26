import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DeactivateItemDialog } from 'modules/item/components/item-directory/components/DeactivateItemDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { Item } from '@warehouser/contracts/items';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// T18 — deactivates an Item while keeping its history readable (AC-06d).
// Nothing here is filled in or validated, so it is a `ConfirmAlertDialog`
// (`docs/system/guides/web-dialogs.md`). DoD: "each dialog handles server
// denial independently and its failure copy states that nothing changed".
// Colocated with the dialog it covers (`placing-web-tests.md` §1).

const item: Item = {
  id: '00000000-0000-4000-8000-000000000220',
  sku: 'SKU-700',
  description: 'Item to retire',
  unitOfMeasure: 'each',
  onHandQuantity: 3,
  deactivatedAt: null,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
};

describe('DeactivateItemDialog', () => {
  it('confirms as an alertdialog, not a form dialog, and closes on success (AC-06d)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn<() => Promise<MutationResult>>().mockResolvedValue({
      data: { ...item, deactivatedAt: '2026-08-21T09:00:00.000Z' },
    });
    renderWithProviders(
      <DialogHost onClose={onClose}>
        <DeactivateItemDialog item={item} onConfirm={onConfirm} />
      </DialogHost>,
    );

    const dialog = screen.getByRole('alertdialog', {
      name: /deactivate item/iu,
    });
    await user.click(
      within(dialog).getByRole('button', { name: /deactivate/iu }),
    );

    expect(onConfirm).toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open on a server denial and states that nothing has changed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn<() => Promise<MutationResult>>().mockResolvedValue({
      error: { code: 'items.target_unavailable', fieldErrors: {} },
    });
    renderWithProviders(
      <DialogHost onClose={vi.fn()}>
        <DeactivateItemDialog item={item} onConfirm={onConfirm} />
      </DialogHost>,
    );

    const dialog = screen.getByRole('alertdialog', {
      name: /deactivate item/iu,
    });
    await user.click(
      within(dialog).getByRole('button', { name: /deactivate/iu }),
    );

    expect(
      await within(dialog).findByText(/nothing has changed/iu),
    ).toBeVisible();
    expect(dialog).toBeInTheDocument();
  });
});
