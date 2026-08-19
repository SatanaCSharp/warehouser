import { render, screen } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWorkspacePermittedItems } from 'shared/hooks/projections/useWorkspacePermittedItems';
import { makeStore } from 'store';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type Action = { id: string; permission: WorkspacePermissionId };

const actions: Action[] = [
  {
    id: 'changeRole',
    permission: WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
  },
  {
    id: 'removeMember',
    permission: WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE,
  },
];

/** See `usePermittedItems.spec.tsx` for why the fixture renders ids. */
const ActionList = (): ReactElement => (
  <ul aria-label="actions">
    {useWorkspacePermittedItems(actions).map((action) => (
      <li key={action.id}>{action.id}</li>
    ))}
  </ul>
);

const contextWith = (
  workspacePermissionIds: readonly WorkspacePermissionId[],
): WorkspaceContext => ({
  workspace: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test Workspace',
  },
  workspacePermissionIds: [...workspacePermissionIds],
  warehouses: [],
  effectiveWarehouseId: null,
});

const renderActions = async (
  workspacePermissionIds: readonly WorkspacePermissionId[],
): Promise<HTMLElement> => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(Response.json(contextWith(workspacePermissionIds))),
    ),
  );
  render(
    <Provider store={makeStore()}>
      <ActionList />
    </Provider>,
  );

  return screen.findByRole('list', { name: 'actions' });
};

describe('useWorkspacePermittedItems', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps only the descriptors whose Workspace Permissions the actor holds', async () => {
    const list = await renderActions([
      WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
    ]);

    expect(await screen.findByText('changeRole')).toBeInTheDocument();
    expect(list.textContent).not.toContain('removeMember');
  });

  it('keeps nothing for an actor holding none of them (AC-30)', async () => {
    const list = await renderActions([]);

    expect(list).toBeEmptyDOMElement();
  });
});
