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

describe('AccessWorkspace archived Warehouse (AC-12, AC-12a, AC-36)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const archivedAt = '2026-08-01T00:00:00.000Z';

  it('marks the page archived and keeps its retained Roles readable, without a Restore control (AC-12a)', async () => {
    stubAccessServer({ archivedAt });

    renderWithProviders(<AccessWorkspace />, authenticatedStore());

    expect(await screen.findByText('Archived')).toBeInTheDocument();
    // Reads still work: the Warehouse's retained Roles remain visible.
    expect(await screen.findByText('Picker')).toBeInTheDocument();
    // Restoring is the Warehouse record's own operation and lives on the
    // Workspace surface, not here.
    expect(
      screen.queryByRole('button', { name: /restore/iu }),
    ).not.toBeInTheDocument();
  });

  it('disables mutating controls that change what the archived Warehouse owns and exposes why (AC-12)', async () => {
    stubAccessServer({ archivedAt });

    renderWithProviders(<AccessWorkspace />, authenticatedStore());

    const createRole = await screen.findByRole('button', {
      name: 'Create role',
    });
    expect(createRole).toBeDisabled();
    expect(screen.getByText(/archived/iu)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Members' }));
    const createMember = await screen.findByRole('button', {
      name: 'Create member',
    });
    expect(createMember).toBeDisabled();
  });

  it('keeps the Warehouse Manager transfer available and enabled on an archived Warehouse (AC-36)', async () => {
    stubAccessServer({ archivedAt });

    renderWithProviders(<AccessWorkspace />, authenticatedStore());

    const transfer = await screen.findByRole('button', {
      name: 'Transfer manager',
    });
    expect(transfer).toBeEnabled();
  });
});
