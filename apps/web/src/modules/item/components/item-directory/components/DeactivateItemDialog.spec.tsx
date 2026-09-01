import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DeactivateItemDialog } from 'modules/item/components/item-directory/components/DeactivateItemDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { Item } from '@warehouser/contracts/items';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// T18 — deactivates an Item while keeping its history readable (AC-06d, frame
// `s5EPi` "Deactivate an item"). Nothing here is filled in or validated, so it
// is a `ConfirmAlertDialog` (`docs/system/guides/web-dialogs.md`). DoD: the
// title names the subject, the body states what stops, what keeps counting —
// with its real counts — and what stays reversible, and a server denial keeps
// the dialog open with the refusal named. Colocated with the dialog it covers
// (`placing-web-tests.md` §1).

const anItem = (overrides: Partial<Item> = {}): Item => ({
  id: '00000000-0000-4000-8000-000000000220',
  sku: 'SKU-700',
  description: 'Item to retire',
  unitOfMeasure: 'each',
  onHandQuantity: 3,
  deactivatedAt: null,
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 0,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  ...overrides,
});

const renderDialog = (
  item: Item = anItem(),
  onConfirm: () => Promise<MutationResult> = vi
    .fn<() => Promise<MutationResult>>()
    .mockResolvedValue({ data: item }),
): { onClose: ReturnType<typeof vi.fn> } => {
  const onClose = vi.fn();
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <DeactivateItemDialog item={item} onConfirm={onConfirm} />
    </DialogHost>,
  );
  return { onClose };
};

const dialog = (): HTMLElement =>
  screen.getByRole('alertdialog', { name: /deactivate SKU-700/iu });

describe('DeactivateItemDialog', () => {
  it('confirms as an alertdialog, not a form dialog, and closes on success (AC-06d)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn<() => Promise<MutationResult>>().mockResolvedValue({
      data: anItem({ deactivatedAt: '2026-08-21T09:00:00.000Z' }),
    });
    const { onClose } = renderDialog(anItem(), onConfirm);

    await user.click(
      within(dialog()).getByRole('button', { name: /deactivate/iu }),
    );

    expect(onConfirm).toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('names its subject in the title (frame `s5EPi` board rule 1)', () => {
    renderDialog();

    expect(dialog()).toHaveAccessibleName(
      'Deactivate SKU-700 · Item to retire?',
    );
  });

  it('states what stops, what keeps counting with its real counts, and what stays reversible (AC-06d)', () => {
    renderDialog(anItem({ namingCustomerOrderCount: 2 }));
    const open = dialog();

    expect(open).toHaveTextContent(
      /it stops being offered when demand is recorded and when a draft is assembled/iu,
    );
    expect(open).toHaveTextContent(
      /the 2 customer orders that already name it stay readable and keep counting exactly as before/iu,
    );
    expect(open).toHaveTextContent(
      /its SKU stays taken — no new item may reuse it/iu,
    );
    expect(open).toHaveTextContent(
      /you can make it active again at any time/iu,
    );
  });

  it('says so plainly when nothing names the Item yet', () => {
    renderDialog();

    expect(dialog()).toHaveTextContent(
      /nothing names it yet, so no record changes/iu,
    );
  });

  it('stays open on a server denial and names the refusal', async () => {
    const user = userEvent.setup();
    const onConfirm = vi
      .fn<() => Promise<MutationResult>>()
      .mockResolvedValue({ error: { code: 'items.target_unavailable' } });
    renderDialog(anItem(), onConfirm);

    await user.click(
      within(dialog()).getByRole('button', { name: /deactivate/iu }),
    );

    expect(
      await within(dialog()).findByText(
        /this item is no longer available in this warehouse, so nothing has changed/iu,
      ),
    ).toBeVisible();
    expect(dialog()).toBeInTheDocument();
  });
});
