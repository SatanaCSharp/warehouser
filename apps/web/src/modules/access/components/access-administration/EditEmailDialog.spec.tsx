import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EditEmailDialog } from 'modules/access/components/access-administration/EditEmailDialog';
import { renderWithProviders } from 'test/render';

import type { EmailChangeInput } from '@warehouser/contracts/users';
import type { MutationOutcome } from 'modules/access/types/access-administration.types';

const targetMember = {
  userId: '00000000-0000-4000-8000-000000000021',
  email: 'jane.doe@example.test',
};

const renderDialog = (
  overrides: Partial<Parameters<typeof EditEmailDialog>[0]> = {},
): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: EmailChangeInput) => Promise<MutationOutcome>>()
    .mockResolvedValue({ success: true });
  renderWithProviders(
    <EditEmailDialog
      member={targetMember}
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onClose, onSave };
};

const dialogName = `Edit email for ${targetMember.email}`;

const fillAndSubmit = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  email: string,
): Promise<void> => {
  if (email) {
    await user.type(within(dialog).getByLabelText('New email'), email);
  }
  await user.click(within(dialog).getByRole('button', { name: 'Save email' }));
};

describe('EditEmailDialog', () => {
  it("changes the target's email and closes on success (AC-04)", async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', { name: dialogName });
    await fillAndSubmit(user, dialog, 'jane.new@example.test');

    expect(onSave).toHaveBeenCalledWith({ email: 'jane.new@example.test' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('explains an invalid email inline and blocks submission (AC-04 validation)', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', { name: dialogName });
    await fillAndSubmit(user, dialog, 'not-an-email');

    expect(
      await within(dialog).findByText('Enter a valid email address.'),
    ).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('renders the duplicate-email explanation reported by the server (AC-05)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi
      .fn<(input: EmailChangeInput) => Promise<MutationOutcome>>()
      .mockResolvedValue({
        success: false,
        fieldErrors: { email: 'duplicate' },
      });
    renderDialog({ onClose, onSave });

    const dialog = screen.getByRole('dialog', { name: dialogName });
    await fillAndSubmit(user, dialog, 'taken@example.test');

    expect(
      await within(dialog).findByText('This email is already registered.'),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders the protected-Manager-target explanation reported by the server (AC-14)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi
      .fn<(input: EmailChangeInput) => Promise<MutationOutcome>>()
      .mockResolvedValue({
        success: false,
        fieldErrors: { email: 'protected' },
      });
    renderDialog({ onClose, onSave });

    const dialog = screen.getByRole('dialog', { name: dialogName });
    await fillAndSubmit(user, dialog, 'jane.new@example.test');

    expect(
      await within(dialog).findByText(
        'The Warehouse Manager role must be transferred to someone else first.',
      ),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders the permission-exceeded-target explanation reported by the server (AC-19)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi
      .fn<(input: EmailChangeInput) => Promise<MutationOutcome>>()
      .mockResolvedValue({
        success: false,
        fieldErrors: { email: 'exceeded' },
      });
    renderDialog({ onClose, onSave });

    const dialog = screen.getByRole('dialog', { name: dialogName });
    await fillAndSubmit(user, dialog, 'jane.new@example.test');

    expect(
      await within(dialog).findByText(
        "You can't change credentials for a member with more permissions than you.",
      ),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });
});
