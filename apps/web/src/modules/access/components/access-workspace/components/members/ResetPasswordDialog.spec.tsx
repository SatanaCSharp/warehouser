import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PasswordChangeInput } from '@warehouser/contracts/users';
import { ResetPasswordDialog } from 'modules/access/components/access-workspace/components/members/ResetPasswordDialog';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { DialogHost } from 'shared/components/DialogHost';
import { renderWithProviders } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

const targetMember = {
  userId: '00000000-0000-4000-8000-000000000022',
  email: 'jane.doe@example.test',
};

const renderDialog = (
  overrides: Partial<Parameters<typeof ResetPasswordDialog>[0]> = {},
): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: PasswordChangeInput) => Promise<MutationResult>>()
    .mockResolvedValue({ data: null });
  renderWithProviders(
    <DialogHost onClose={onClose}>
      <ResetPasswordDialog
        member={targetMember}
        onSave={onSave}
        {...overrides}
      />
    </DialogHost>,
  );
  return { onClose, onSave };
};

const dialogName = `Reset password for ${targetMember.email}`;

const fillAndSubmit = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  password: string,
): Promise<void> => {
  if (password) {
    await user.type(within(dialog).getByLabelText('New password'), password);
  }
  await user.click(
    within(dialog).getByRole('button', { name: 'Reset password' }),
  );
};

describe('ResetPasswordDialog', () => {
  it("sets the target's new password and closes on success (AC-06)", async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', { name: dialogName });
    await fillAndSubmit(user, dialog, 'a-strong-password');

    expect(onSave).toHaveBeenCalledWith({ password: 'a-strong-password' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('explains an invalid password length inline and blocks submission (AC-07)', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', { name: dialogName });
    await fillAndSubmit(user, dialog, 'short');

    expect(
      await within(dialog).findByText('Use 8 to 128 characters.'),
    ).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('renders the protected-Manager-target explanation reported by the server (AC-14)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: PasswordChangeInput) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: {
          code: 'access.refused',
          fieldErrors: { password: 'protected' },
        },
      });
    const { onClose } = renderDialog({ onSave });

    const dialog = screen.getByRole('dialog', { name: dialogName });
    await fillAndSubmit(user, dialog, 'a-strong-password');

    expect(
      await within(dialog).findByText(
        'The Warehouse Manager role must be transferred to someone else first.',
      ),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders the permission-exceeded-target explanation reported by the server (AC-19)', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(input: PasswordChangeInput) => Promise<MutationResult>>()
      .mockResolvedValue({
        error: {
          code: 'access.refused',
          fieldErrors: { password: 'exceeded' },
        },
      });
    const { onClose } = renderDialog({ onSave });

    const dialog = screen.getByRole('dialog', { name: dialogName });
    await fillAndSubmit(user, dialog, 'a-strong-password');

    expect(
      await within(dialog).findByText(
        "You can't change credentials for a member with more permissions than you.",
      ),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });
});
