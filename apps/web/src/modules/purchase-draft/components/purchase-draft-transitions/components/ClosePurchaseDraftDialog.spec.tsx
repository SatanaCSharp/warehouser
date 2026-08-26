import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { ClosePurchaseDraftDialog } from 'modules/purchase-draft/components/purchase-draft-transitions/components/ClosePurchaseDraftDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { PurchaseDraftClosure } from '@warehouser/contracts/purchase-drafts';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

// T21 — closing a frozen draft states a reason, so something is filled in and
// it is a `FormModalDialog` rather than a confirmation
// (`docs/system/guides/web-dialogs.md` §1). DoD: "A test proves the close
// dialog requires a reason and that success copy states the outcome that
// committed (AC-21)" — the success copy itself is the registry entry the
// middleware raises, asserted in `mutation-feedback.middleware.spec.ts`.

const openDialog = (
  onSubmit: (input: PurchaseDraftClosure) => Promise<MutationResult>,
  onClose = vi.fn(),
): void => {
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <ClosePurchaseDraftDialog onSubmit={onSubmit} />
    </DialogHost>,
  );
};

const closeDialog = (): HTMLElement =>
  screen.getByRole('dialog', { name: /close .*draft/iu });

describe('ClosePurchaseDraftDialog', () => {
  it('records the closure reason and closes on success (AC-21)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi
      .fn<(input: PurchaseDraftClosure) => Promise<MutationResult>>()
      .mockResolvedValue({ data: {} });
    openDialog(onSubmit, onClose);

    const dialog = closeDialog();
    await user.type(
      within(dialog).getByLabelText(/reason/iu),
      'The supplier cannot fulfil the order',
    );
    await user.click(
      within(dialog).getByRole('button', { name: /close draft/iu }),
    );

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        closureReason: 'The supplier cannot fulfil the order',
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('never closes a draft without a reason: no request is made and the field says why (AC-21)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(input: PurchaseDraftClosure) => Promise<MutationResult>>()
      .mockResolvedValue({ data: {} });
    openDialog(onSubmit);

    const dialog = closeDialog();
    await user.click(
      within(dialog).getByRole('button', { name: /close draft/iu }),
    );

    expect(
      await within(dialog).findByText(/state why the supplier cannot fulfil/iu),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  it('stays open on a server refusal, surfacing the reason and that nothing changed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(input: PurchaseDraftClosure) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: {
          code: ErrorCode.PURCHASE_DRAFTS_INVALID_STATE,
          fieldErrors: {},
        },
      });
    openDialog(onSubmit);

    const dialog = closeDialog();
    await user.type(within(dialog).getByLabelText(/reason/iu), 'Out of stock');
    await user.click(
      within(dialog).getByRole('button', { name: /close draft/iu }),
    );

    const refusal = await within(dialog).findByRole('alert');
    expect(refusal).toHaveTextContent(/nothing has changed/iu);
    expect(dialog).toBeInTheDocument();
  });

  it('places cancel before the destructive primary in DOM and keyboard order', () => {
    openDialog(
      vi
        .fn<(input: PurchaseDraftClosure) => Promise<MutationResult>>()
        .mockResolvedValue({ data: {} }),
    );

    const labels = within(closeDialog())
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(labels.indexOf('Cancel')).toBeLessThan(
      labels.findIndex((label) => /close draft/iu.test(label ?? '')),
    );
  });
});
