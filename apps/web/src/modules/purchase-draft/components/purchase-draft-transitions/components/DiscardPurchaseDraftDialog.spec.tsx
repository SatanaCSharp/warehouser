import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { DiscardPurchaseDraftDialog } from 'modules/purchase-draft/components/purchase-draft-transitions/components/DiscardPurchaseDraftDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { MutationResult } from 'shared/api/client/mutation-outcome';

// T21 — discarding validates nothing, so it is a `ConfirmAlertDialog`
// (`docs/system/guides/web-dialogs.md` §1). DoD: "A test proves discard is not
// offered for a ready draft and its server refusal is surfaced (AC-24a)" — the
// half about not being offered belongs to the owner that decides which
// transitions a state admits (`PurchaseDraftTransitions.spec.tsx`); this file
// owns the refusal the boundary itself returns.

const openDialog = (
  onConfirm: () => Promise<MutationResult>,
  onClose = vi.fn(),
): void => {
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <DiscardPurchaseDraftDialog onConfirm={onConfirm} />
    </DialogHost>,
  );
};

const discardDialog = (): HTMLElement =>
  screen.getByRole('alertdialog', { name: /discard/iu });

describe('DiscardPurchaseDraftDialog', () => {
  it('discards the draft and closes on success (AC-24)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi
      .fn<() => Promise<MutationResult>>()
      .mockResolvedValue({ data: {} });
    openDialog(onConfirm, onClose);

    const dialog = discardDialog();
    await user.click(
      within(dialog).getByRole('button', { name: /discard draft/iu }),
    );

    expect(onConfirm).toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('surfaces the server refusal for a draft already made ready, and states that nothing changed (AC-24a)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn<() => Promise<MutationResult>>().mockResolvedValue({
      error: {
        code: ErrorCode.PURCHASE_DRAFTS_DISCARD_UNAVAILABLE,
        fieldErrors: {},
      },
    });
    openDialog(onConfirm);

    const dialog = discardDialog();
    await user.click(
      within(dialog).getByRole('button', { name: /discard draft/iu }),
    );

    const refusal = await within(dialog).findByRole('alert');
    expect(refusal).toHaveTextContent(
      /closed with a reason rather than discarded/iu,
    );
    expect(refusal).toHaveTextContent(/nothing has changed/iu);
    expect(dialog).toBeInTheDocument();
  });

  it('places cancel before the destructive primary in DOM and keyboard order', () => {
    openDialog(
      vi.fn<() => Promise<MutationResult>>().mockResolvedValue({ data: {} }),
    );

    const labels = within(discardDialog())
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(labels.indexOf('Cancel')).toBeLessThan(
      labels.findIndex((label) => /discard draft/iu.test(label ?? '')),
    );
  });
});
