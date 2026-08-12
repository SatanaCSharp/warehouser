import { render, screen } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionGate } from 'shared/components/PermissionGate';
import { makeStore } from 'store';

import type { AccessProjection } from '@warehouser/contracts/access';
import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { PermissionGateProps } from 'shared/components/PermissionGate';

const access: AccessProjection = {
  warehouseId: '00000000-0000-4000-8000-000000000010',
  roleId: '00000000-0000-4000-8000-000000000011',
  roleKind: 'custom',
  permissionIds: [PermissionId.ROLES_WATCH],
};

const stubAccess = (data: AccessProjection): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json(data))),
  );
};

describe('PermissionGate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders children when the cached actor holds the required permission', async () => {
    stubAccess(access);
    render(
      <Provider store={makeStore()}>
        <PermissionGate permission={PermissionId.ROLES_WATCH}>
          <p>secret</p>
        </PermissionGate>
      </Provider>,
    );

    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  it('renders the fallback when the cached actor lacks the required permission', async () => {
    stubAccess({ ...access, permissionIds: [] });
    render(
      <Provider store={makeStore()}>
        <PermissionGate
          permission={PermissionId.ROLES_WATCH}
          fallback={<p>denied</p>}
        >
          <p>secret</p>
        </PermissionGate>
      </Provider>,
    );

    expect(await screen.findByText('denied')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders nothing while the cache resolves and no fallback is given', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <Provider store={makeStore()}>
        <PermissionGate permission={PermissionId.ROLES_WATCH}>
          <p>secret</p>
        </PermissionGate>
      </Provider>,
    );

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('overrides the cache with an explicit permissionIds list', () => {
    stubAccess({ ...access, permissionIds: [] });
    render(
      <Provider store={makeStore()}>
        <PermissionGate
          permission={PermissionId.ROLES_WATCH}
          permissionIds={[PermissionId.ROLES_WATCH]}
        >
          <p>secret</p>
        </PermissionGate>
      </Provider>,
    );

    expect(screen.getByText('secret')).toBeInTheDocument();
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
