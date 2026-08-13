import { screen } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionGate } from 'shared/components/PermissionGate';
import { makeStore } from 'store';
import { renderInEnteredWarehouse } from 'test/render';

import type { AccessProjection } from '@warehouser/contracts/access';
import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { PermissionGateProps } from 'shared/components/PermissionGate';

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

describe('PermissionGate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders children when the cached actor holds the required permission', async () => {
    stubAccess(access);
    renderInEnteredWarehouse(
      <PermissionGate permission={PermissionId.ROLES_WATCH}>
        <p>secret</p>
      </PermissionGate>,
      makeStore(),
      access.warehouseId,
    );

    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  it('renders the fallback when the cached actor lacks the required permission', async () => {
    stubAccess({ ...access, permissionIds: [] });
    renderInEnteredWarehouse(
      <PermissionGate
        permission={PermissionId.ROLES_WATCH}
        fallback={<p>denied</p>}
      >
        <p>secret</p>
      </PermissionGate>,
      makeStore(),
      access.warehouseId,
    );

    expect(await screen.findByText('denied')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders nothing while the cache resolves and no fallback is given', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    // The sibling marker proves the subject mounted, so the absent `secret`
    // below is the gate withholding it rather than the route not yet resolved.
    renderInEnteredWarehouse(
      <>
        <p>mounted</p>
        <PermissionGate permission={PermissionId.ROLES_WATCH}>
          <p>secret</p>
        </PermissionGate>
      </>,
      makeStore(),
      access.warehouseId,
    );

    expect(await screen.findByText('mounted')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('overrides the cache with an explicit permissionIds list', async () => {
    stubAccess({ ...access, permissionIds: [] });
    renderInEnteredWarehouse(
      <PermissionGate
        permission={PermissionId.ROLES_WATCH}
        permissionIds={[PermissionId.ROLES_WATCH]}
      >
        <p>secret</p>
      </PermissionGate>,
      makeStore(),
      access.warehouseId,
    );

    expect(await screen.findByText('secret')).toBeInTheDocument();
  });
});

describe('PermissionGateProps / WorkspacePermissionId vocabulary separation (AC-31)', () => {
  it('never accepts a readonly WorkspacePermissionId[] as the gate permissionIds prop', () => {
    type GatePermissionIdsProp = PermissionGateProps['permissionIds'];
    const workspacePermissionIds = [
      'WORKSPACE:RENAME' as WorkspacePermissionId,
    ];

    // @ts-expect-error a readonly WorkspacePermissionId[] must never satisfy the Warehouse-level
    // gate's `permissionIds` prop — the two authorization vocabularies never meet (AC-31).
    const asGatePermissionIds: GatePermissionIdsProp = workspacePermissionIds;

    expect(Array.isArray(asGatePermissionIds)).toBe(true);
  });
});
