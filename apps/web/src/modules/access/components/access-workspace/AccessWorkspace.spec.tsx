import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccessWorkspace } from 'modules/access/components/access-workspace/AccessWorkspace';
import { makeStore } from 'store';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderWithProviders } from 'test/render';

const memberPermissions = [
  PermissionId.USERS_WATCH,
  PermissionId.USERS_CREATE,
  PermissionId.USERS_EMAIL_UPDATE,
  PermissionId.USERS_PASSWORD_CHANGE,
  PermissionId.USERS_DELETE,
];

describe('AccessWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the administration-capable Members workspace on the members tab when authorized (member-only Permissions, no Role Permissions)', async () => {
    const user = userEvent.setup();
    stubAccessServer({ permissionIds: memberPermissions });

    renderWithProviders(<AccessWorkspace />, authenticatedStore());

    await user.click(await screen.findByRole('tab', { name: 'Members' }));

    expect(
      await screen.findByRole('button', { name: 'Create member' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', {
        name: 'Actions for member@example.test',
      }),
    ).toBeInTheDocument();
  });

  it('hides the Members tab, its requests, and its data without USERS:WATCH', async () => {
    const requestedUrls = stubAccessServer({ permissionIds: [] });

    renderWithProviders(<AccessWorkspace />, makeStore());

    await waitFor(() =>
      expect(requestedUrls.some((url) => url.includes('/access/current'))).toBe(
        true,
      ),
    );
    expect(
      screen.queryByRole('tab', { name: 'Members' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        requestedUrls.some((url) => url.includes('/api/v1/access/members')),
      ).toBe(false),
    );
  });

  it('shows the approved Members list, not the raw dataset card, for a USERS:WATCH-only actor', async () => {
    const user = userEvent.setup();
    stubAccessServer({ permissionIds: [PermissionId.USERS_WATCH] });

    renderWithProviders(<AccessWorkspace />, authenticatedStore());

    await user.click(await screen.findByRole('tab', { name: 'Members' }));

    expect(await screen.findByLabelText('Search members')).toBeInTheDocument();
    expect(screen.queryByText(accessIds.member)).not.toBeInTheDocument();
  });

  it('loads Roles for a Create-Member actor even without a role-admin Permission (US-07)', async () => {
    const user = userEvent.setup();
    stubAccessServer({
      permissionIds: [PermissionId.USERS_WATCH, PermissionId.USERS_CREATE],
    });

    renderWithProviders(<AccessWorkspace />, authenticatedStore());

    await user.click(await screen.findByRole('tab', { name: 'Members' }));
    await user.click(
      await screen.findByRole('button', { name: 'Create member' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Create member' });

    expect(
      within(dialog).getByRole('option', { name: 'Picker', hidden: true }),
    ).toBeInTheDocument();
  });
});
