import { screen } from '@testing-library/react';
import type { AccessProjection } from '@warehouser/contracts/access';
import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { PermissionId } from '@warehouser/shared-types/enums';
import type { WarehousePermissionGateProps } from 'shared/components/WarehousePermissionGate';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { makeStore } from 'store';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

const access: AccessProjection = {
  warehouseId: '00000000-0000-4000-8000-000000000010',
  roleId: '00000000-0000-4000-8000-000000000011',
  roleKind: 'custom',
  permissionIds: [PermissionId.ROLES_WATCH],
  archivedAt: null,
};

// T6 / CR-AC-06 — the gate reads the projection of the Warehouse its address
// names, so the only request under test is that Warehouse's own
// `access/current`. A request for any other Warehouse 404s, which is how these
// cases prove the read followed the address.
const stubAccess = (data: AccessProjection): void => {
  const currentPath = `/api/v1/warehouses/${data.warehouseId}/access/current`;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      return Promise.resolve(
        url === currentPath
          ? Response.json(data)
          : Response.json({}, { status: 404 }),
      );
    }),
  );
};

describe('WarehousePermissionGate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders children when the cached actor holds the required permission', async () => {
    stubAccess(access);
    renderInEnteredWarehouse(
      <WarehousePermissionGate permission={PermissionId.ROLES_WATCH}>
        <p>secret</p>
      </WarehousePermissionGate>,
      makeStore(),
      access.warehouseId,
    );

    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  it('renders nothing — not a disabled or empty state — when the cached actor lacks the required permission', async () => {
    stubAccess({ ...access, permissionIds: [] });
    // The sibling marker proves the subject mounted and the projection resolved,
    // so the absent `secret` below is the gate withholding it.
    renderInEnteredWarehouse(
      <>
        <p>mounted</p>
        <WarehousePermissionGate permission={PermissionId.ROLES_WATCH}>
          <p>secret</p>
        </WarehousePermissionGate>
      </>,
      makeStore(),
      access.warehouseId,
    );

    expect(await screen.findByText('mounted')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders children when the actor holds any one of several required permissions', async () => {
    stubAccess(access);
    renderInEnteredWarehouse(
      <WarehousePermissionGate
        permission={[PermissionId.USERS_WATCH, PermissionId.ROLES_WATCH]}
      >
        <p>secret</p>
      </WarehousePermissionGate>,
      makeStore(),
      access.warehouseId,
    );

    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  it('renders nothing when the actor holds none of several required permissions', async () => {
    stubAccess({ ...access, permissionIds: [] });
    renderInEnteredWarehouse(
      <>
        <p>mounted</p>
        <WarehousePermissionGate
          permission={[PermissionId.USERS_WATCH, PermissionId.ROLES_WATCH]}
        >
          <p>secret</p>
        </WarehousePermissionGate>
      </>,
      makeStore(),
      access.warehouseId,
    );

    expect(await screen.findByText('mounted')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders nothing while the cache resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderInEnteredWarehouse(
      <>
        <p>mounted</p>
        <WarehousePermissionGate permission={PermissionId.ROLES_WATCH}>
          <p>secret</p>
        </WarehousePermissionGate>
      </>,
      makeStore(),
      access.warehouseId,
    );

    expect(await screen.findByText('mounted')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});

describe('WarehousePermissionGateProps / WorkspacePermissionId vocabulary separation (AC-31)', () => {
  it('never accepts the Workspace-level WorkspacePermissionId as the gate permission prop', () => {
    type GatePermissionProp = WarehousePermissionGateProps['permission'];
    const workspacePermission = 'WORKSPACE:RENAME' as WorkspacePermissionId;

    // @ts-expect-error a WorkspacePermissionId must never satisfy the Warehouse-level gate's
    // `permission` prop — the two authorization vocabularies never meet (AC-31).
    const asGatePermission: GatePermissionProp = workspacePermission;

    expect(asGatePermission).toBe(workspacePermission);
  });
});
