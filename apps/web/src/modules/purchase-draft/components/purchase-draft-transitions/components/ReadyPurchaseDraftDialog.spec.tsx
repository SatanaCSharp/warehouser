import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { ReadyPurchaseDraftDialog } from 'modules/purchase-draft/components/purchase-draft-transitions/components/ReadyPurchaseDraftDialog';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';

import type { MutationResult } from 'shared/api/client/mutation-outcome';

// T21 — freezing a draft is irreversible and validates nothing, so it is a
// `ConfirmAlertDialog` rather than a form (`docs/system/guides/web-dialogs.md`
// §1). DoD: "A test proves the ready dialog is unavailable for a draft with no
// lines and surfaces the server refusal if attempted (AC-14a)".
// Colocated with the dialog it covers (`placing-web-tests.md` §1).

const openDialog = (
  lineCount: number,
  onConfirm: () => Promise<MutationResult>,
  onClose = vi.fn(),
): void => {
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <ReadyPurchaseDraftDialog
        lineCount={lineCount}
        reference="PD-0143"
        onConfirm={onConfirm}
      />
    </DialogHost>,
  );
};

// The title names the draft it acts on (`s5EPi`), so the dialog is found by a
// name that includes the reference rather than by the act alone.
const readyDialog = (): HTMLElement =>
  screen.getByRole('alertdialog', { name: /move pd-0143 to ready/iu });

describe('ReadyPurchaseDraftDialog', () => {
  it('freezes the draft and closes on success (AC-14)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi
      .fn<() => Promise<MutationResult>>()
      .mockResolvedValue({ data: {} });
    openDialog(2, onConfirm, onClose);

    const dialog = readyDialog();
    await user.click(
      within(dialog).getByRole('button', { name: /freeze and mark ready/iu }),
    );

    expect(onConfirm).toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('refuses to confirm a draft holding no lines, with the reason exposed rather than hidden (AC-14a)', () => {
    const onConfirm = vi
      .fn<() => Promise<MutationResult>>()
      .mockResolvedValue({ data: {} });
    openDialog(0, onConfirm);

    const dialog = readyDialog();
    expect(
      within(dialog).getByRole('button', { name: /freeze and mark ready/iu }),
    ).toBeDisabled();
    expect(
      within(dialog).getByText(
        /only ready once it says what is being ordered/iu,
      ),
    ).toBeVisible();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('surfaces the server refusal and states that nothing changed when the freeze is attempted anyway (AC-14a)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn<() => Promise<MutationResult>>().mockResolvedValue({
      error: { code: ErrorCode.PURCHASE_DRAFTS_DRAFT_EMPTY, fieldErrors: {} },
    });
    openDialog(2, onConfirm);

    const dialog = readyDialog();
    await user.click(
      within(dialog).getByRole('button', { name: /freeze and mark ready/iu }),
    );

    const refusal = await within(dialog).findByRole('alert');
    expect(refusal).toHaveTextContent(
      /only ready once it says what is being ordered/iu,
    );
    expect(refusal).toHaveTextContent(/nothing has changed/iu);
    expect(dialog).toBeInTheDocument();
  });

  // `s5EPi` — the frame states four labelled things before an irreversible
  // act, and what a member *loses* is half of them. Collapsing them into one
  // sentence about lines and quantities left "no longer possible, by anyone"
  // unsaid.
  it('states what is frozen, what is captured, what is still possible and what is not (AC-14/AC-15)', () => {
    openDialog(
      2,
      vi.fn<() => Promise<MutationResult>>().mockResolvedValue({ data: {} }),
    );

    const dialog = readyDialog();
    expect(
      within(dialog).getByText(
        'Frozen now — its 2 lines, their quantities, their links, the packaging and notes, and the expected arrival date.',
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/^Captured now — what each linked customer/u),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/^Still possible — confirming what arrived/u),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/^No longer possible — changing a line/u),
    ).toBeVisible();
    expect(within(dialog).getByText(/By anyone\.$/u)).toBeVisible();
  });

  it('places cancel before the destructive primary in DOM and keyboard order', () => {
    openDialog(
      2,
      vi.fn<() => Promise<MutationResult>>().mockResolvedValue({ data: {} }),
    );

    const buttons = within(readyDialog()).getAllByRole('button');
    const labels = buttons.map((button) => button.textContent);

    expect(labels.indexOf('Cancel')).toBeLessThan(
      labels.findIndex((label) => /freeze and mark ready/iu.test(label ?? '')),
    );
  });
});
