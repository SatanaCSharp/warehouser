import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccessWorkspace } from 'modules/access/components/access-workspace/AccessWorkspace';
import { renderWithProviders } from 'test/render';

import type { AccessProjection } from '@warehouser/contracts/access';

const warehouseId = '00000000-0000-4000-8000-000000000010';
const actorRoleId = '00000000-0000-4000-8000-000000000011';
const memberUserId = '00000000-0000-4000-8000-000000000002';

const membersPage = {
  hasNext: false,
  hasPrev: false,
  nextCursor: null,
  items: [
    {
      userId: memberUserId,
      roleId: actorRoleId,
      roleKind: 'custom' as const,
      email: 'member@example.test',
    },
  ],
};

const baseAccess: AccessProjection = {
  warehouseId,
  roleId: actorRoleId,
  roleKind: 'custom',
  permissionIds: [
    PermissionId.USERS_WATCH,
    PermissionId.USERS_CREATE,
    PermissionId.USERS_EMAIL_UPDATE,
    PermissionId.USERS_PASSWORD_CHANGE,
    PermissionId.USERS_DELETE,
  ],
};

describe('AccessWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the administration-capable Members workspace on the members tab when authorized (member-only Permissions, no Role Permissions)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(membersPage));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AccessWorkspace access={baseAccess} />);

    await user.click(screen.getByRole('tab', { name: 'Members' }));

    expect(
      await screen.findByRole('button', { name: 'Create member' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', {
        name: 'Edit email for member@example.test',
      }),
    ).toBeInTheDocument();
  });

  it('hides the Members tab, its requests, and its data without USERS:WATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(membersPage));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(
      <AccessWorkspace access={{ ...baseAccess, permissionIds: [] }} />,
    );

    expect(
      screen.queryByRole('tab', { name: 'Members' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/access/members'),
        expect.anything(),
      ),
    );
  });
});
