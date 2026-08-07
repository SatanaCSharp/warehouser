import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccessWorkspace } from 'modules/access/components/access-workspace/AccessWorkspace';
import { authBecameAuthenticated } from 'modules/auth/store/auth.slice';
import { makeStore } from 'store';
import { renderWithProviders } from 'test/render';

import type { AccessProjection } from '@warehouser/contracts/access';
import type { AppStore } from 'store';

const warehouseId = '00000000-0000-4000-8000-000000000010';
const actorRoleId = '00000000-0000-4000-8000-000000000011';
const actingUserId = '00000000-0000-4000-8000-000000000001';
const memberUserId = '00000000-0000-4000-8000-000000000002';
const pickerRoleId = '00000000-0000-4000-8000-000000000012';

const authenticatedStore = (): AppStore => {
  const store = makeStore();
  store.dispatch(authBecameAuthenticated({ id: actingUserId }));
  return store;
};

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

const rolesPage = {
  hasNext: false,
  hasPrev: false,
  nextCursor: null,
  items: [
    {
      id: pickerRoleId,
      kind: 'custom' as const,
      name: 'Picker',
      permissionIds: [],
      assignedMemberCount: 0,
    },
  ],
};

const stubFetchByPath = (
  routes: Readonly<Record<string, unknown>>,
): ReturnType<typeof vi.fn> =>
  vi.fn((input: Request | string | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const match = Object.entries(routes).find(([path]) => url.includes(path));
    return Promise.resolve(Response.json(match ? match[1] : { items: [] }));
  });

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
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(membersPage)));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(
      <AccessWorkspace access={baseAccess} />,
      authenticatedStore(),
    );

    await user.click(screen.getByRole('tab', { name: 'Members' }));

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
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(membersPage)));
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

  it('shows the approved Members list, not the raw dataset card, for a USERS:WATCH-only actor', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', stubFetchByPath({ '/access/members': membersPage }));

    renderWithProviders(
      <AccessWorkspace
        access={{ ...baseAccess, permissionIds: [PermissionId.USERS_WATCH] }}
      />,
      authenticatedStore(),
    );

    await user.click(screen.getByRole('tab', { name: 'Members' }));

    expect(await screen.findByLabelText('Search members')).toBeInTheDocument();
    expect(screen.queryByText(memberUserId)).not.toBeInTheDocument();
  });

  it('loads Roles for a Create-Member actor even without a role-admin Permission (US-07)', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      stubFetchByPath({
        '/access/roles': rolesPage,
        '/access/members': membersPage,
      }),
    );

    renderWithProviders(
      <AccessWorkspace
        access={{
          ...baseAccess,
          permissionIds: [PermissionId.USERS_WATCH, PermissionId.USERS_CREATE],
        }}
      />,
      authenticatedStore(),
    );

    await user.click(screen.getByRole('tab', { name: 'Members' }));
    await user.click(
      await screen.findByRole('button', { name: 'Create member' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Create member' });

    expect(
      within(dialog).getByRole('option', { name: 'Picker' }),
    ).toBeInTheDocument();
  });
});
