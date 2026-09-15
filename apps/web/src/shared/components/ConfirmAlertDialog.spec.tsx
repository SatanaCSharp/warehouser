import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { describe, expect, it, vi } from 'vitest';

// The confirm sequence `docs/system/guides/web-dialogs.md` §4 assigns to this
// component rather than to each confirmation: run the request, close only on
// success, and report a refusal back to whoever explains it.

const renderDialog = (
  result: MutationResult,
  onRefusal?: (code?: string) => void,
): {
  onClose: ReturnType<typeof vi.fn>;
  onConfirm: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onConfirm = vi
    .fn<() => Promise<MutationResult>>()
    .mockResolvedValue(result);
  render(
    <DialogHost onClose={onClose}>
      <ConfirmAlertDialog
        title="Archive Central DC"
        cancelLabel="Cancel"
        confirmLabel="Archive"
        onConfirm={onConfirm}
        onRefusal={onRefusal}
      >
        <p>Operations stop. Records are kept.</p>
      </ConfirmAlertDialog>
    </DialogHost>,
  );
  return { onClose, onConfirm };
};

const confirmDialog = (): HTMLElement =>
  screen.getByRole('alertdialog', { name: 'Archive Central DC' });

describe('ConfirmAlertDialog', () => {
  it('announces itself as an alertdialog and states what will happen', () => {
    renderDialog({ data: null });

    expect(
      within(confirmDialog()).getByText('Operations stop. Records are kept.'),
    ).toBeVisible();
  });

  it('runs the request and closes once it succeeds', async () => {
    const user = userEvent.setup();
    const { onClose, onConfirm } = renderDialog({ data: null });

    await user.click(
      within(confirmDialog()).getByRole('button', { name: 'Archive' }),
    );

    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open on a refusal and reports its code', async () => {
    const user = userEvent.setup();
    const onRefusal = vi.fn();
    const { onClose } = renderDialog(
      { error: { code: 'workspace.denied' } },
      onRefusal,
    );

    await user.click(
      within(confirmDialog()).getByRole('button', { name: 'Archive' }),
    );

    await waitFor(() =>
      expect(onRefusal).toHaveBeenCalledWith('workspace.denied'),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(confirmDialog()).toBeInTheDocument();
  });

  it('cancels without making the request', async () => {
    const user = userEvent.setup();
    const { onClose, onConfirm } = renderDialog({ data: null });

    await user.click(
      within(confirmDialog()).getByRole('button', { name: 'Cancel' }),
    );

    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('leaves the confirmation dismissable from the keyboard', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ data: null });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
