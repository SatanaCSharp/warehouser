import { render, screen } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceGate } from 'shared/components/WorkspaceGate';
import { makeStore } from 'store';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { PermissionId } from '@warehouser/shared-types/enums';
import type { WorkspaceGateProps } from 'shared/components/WorkspaceGate';

const ownWorkspaceContext: WorkspaceContext = {
  workspace: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test Workspace',
  },
  workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
  warehouses: [],
  effectiveWarehouseId: null,
};

// AC-30: a User with no Workspace membership — the `noWorkspaceCapabilities` example of
// `GET /api/v1/workspace/context`.
const noMembershipContext: WorkspaceContext = {
  ...ownWorkspaceContext,
  workspacePermissionIds: [],
};

const stubContext = (data: WorkspaceContext): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json(data)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('WorkspaceGate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders children when the cached actor holds the required Workspace Permission', async () => {
    stubContext(ownWorkspaceContext);
    render(
      <Provider store={makeStore()}>
        <WorkspaceGate permission={WorkspacePermissionId.WAREHOUSES_WATCH}>
          <p>secret</p>
        </WorkspaceGate>
      </Provider>,
    );

    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  it('renders nothing — not a disabled or empty state — for a User with no Workspace membership (AC-30)', async () => {
    const fetchMock = stubContext(noMembershipContext);
    render(
      <Provider store={makeStore()}>
        <WorkspaceGate permission={WorkspacePermissionId.WAREHOUSES_WATCH}>
          <p>secret</p>
        </WorkspaceGate>
      </Provider>,
    );

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/workspace/context',
        expect.anything(),
      ),
    );

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    // No control, disabled or empty placeholder is offered in its place, and no further
    // Workspace dataset is requested for a User who is no Workspace Member (AC-30).
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders children when the actor holds any one of several required Workspace Permissions', async () => {
    stubContext(ownWorkspaceContext);
    render(
      <Provider store={makeStore()}>
        <WorkspaceGate
          permission={[
            WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
            WorkspacePermissionId.WAREHOUSES_WATCH,
          ]}
        >
          <p>secret</p>
        </WorkspaceGate>
      </Provider>,
    );

    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  it('renders nothing when the actor holds none of several required Workspace Permissions (AC-30)', async () => {
    const fetchMock = stubContext(noMembershipContext);
    render(
      <Provider store={makeStore()}>
        <WorkspaceGate
          permission={[
            WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
            WorkspacePermissionId.WAREHOUSES_WATCH,
          ]}
        >
          <p>secret</p>
        </WorkspaceGate>
      </Provider>,
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders nothing while the cache resolves and no fallback is given', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <Provider store={makeStore()}>
        <WorkspaceGate permission={WorkspacePermissionId.WAREHOUSES_WATCH}>
          <p>secret</p>
        </WorkspaceGate>
      </Provider>,
    );

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});

describe('WorkspaceGateProps / PermissionId vocabulary separation (AC-31)', () => {
  it('never accepts the Warehouse-level PermissionId as the gate permission prop', () => {
    type GatePermissionProp = WorkspaceGateProps['permission'];
    const warehousePermission = 'ROLES:WATCH' as PermissionId;

    // @ts-expect-error a Warehouse-level PermissionId must never satisfy the Workspace gate's
    // `permission` prop — the two authorization vocabularies never meet (AC-31).
    const asGatePermission: GatePermissionProp = warehousePermission;

    expect(typeof asGatePermission).toBe('string');
  });
});
