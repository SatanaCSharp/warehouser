import { screen } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import type { ReactElement } from 'react';
import { usePermittedItems } from 'shared/hooks/projections/usePermittedItems';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Action = { id: string; permission: readonly PermissionId[] };

/**
 * The collection form of `WarehousePermissionGate`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`): the subject is
 * a descriptor list, so the fixture renders the ids that survived rather than an
 * element per gate.
 */
const ActionList = ({ actions }: { actions: Action[] }): ReactElement => (
  <ul aria-label="actions">
    {usePermittedItems(actions).map((action) => (
      <li key={action.id}>{action.id}</li>
    ))}
  </ul>
);

const actions: Action[] = [
  { id: 'editEmail', permission: [PermissionId.USERS_EMAIL_UPDATE] },
  { id: 'deleteMember', permission: [PermissionId.USERS_DELETE] },
  {
    id: 'readEither',
    permission: [PermissionId.USERS_WATCH, PermissionId.ROLES_WATCH],
  },
];

const renderActions = async (
  permissionIds: readonly PermissionId[],
): Promise<HTMLElement> => {
  stubAccessServer({ permissionIds });
  renderInEnteredWarehouse(
    <ActionList actions={actions} />,
    authenticatedStore(),
    accessIds.warehouse,
  );

  return screen.findByRole('list', { name: 'actions' });
};

describe('usePermittedItems', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps only the descriptors whose Permissions the actor holds', async () => {
    const list = await renderActions([PermissionId.USERS_EMAIL_UPDATE]);

    expect(await screen.findByText('editEmail')).toBeInTheDocument();
    expect(list.textContent).not.toContain('deleteMember');
  });

  it('offers a descriptor naming several Permissions to the holder of any one of them', async () => {
    await renderActions([PermissionId.ROLES_WATCH]);

    expect(await screen.findByText('readEither')).toBeInTheDocument();
  });

  it('keeps nothing for an actor holding none of them (AC-30)', async () => {
    const list = await renderActions([]);

    expect(list).toBeEmptyDOMElement();
  });
});
